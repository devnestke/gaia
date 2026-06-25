import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import http from "http";
import { randomUUID } from "crypto";
import { sql } from "kysely";
import db from "./db";
import { recomputeScores, pickNext } from "./scoring";
import { attachRealtime, broadcastPool, fetchPool } from "./realtime";
import {
  searchTracks,
  listGenres,
  discover,
  type GaiaTrack,
} from "./deezer";

const app = express();
const port = process.env.SERVER_PORT || 3001;

app.use(cors({ origin: "*", methods: "*", allowedHeaders: "*" }));
app.use(express.json());

// Lightweight request log
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
    );
  });
  next();
});

const fail = (res: Response, code: number, error: string) =>
  void res.status(code).json({ error });

// ---------------------------------------------------------------------------
// Users — anonymous guests: a stable fingerprint + a display nickname.
// ---------------------------------------------------------------------------
app.get("/api/users/:id", async (req, res) => {
  const id = req.params.id;
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where(sql<boolean>`id = ${id} OR fingerprint = ${id}`)
    .executeTakeFirst();
  if (!user) return fail(res, 404, "User not found");
  res.json(user);
});

app.post("/api/users", async (req, res) => {
  const { fingerprint, username } = req.body;
  if (!fingerprint || !username)
    return fail(res, 400, "fingerprint and username are required");
  const existing = await db
    .selectFrom("users")
    .selectAll()
    .where("fingerprint", "=", fingerprint)
    .executeTakeFirst();
  if (existing) {
    res.json(existing); // idempotent join
    return;
  }
  const id = randomUUID();
  const created_at = new Date().toISOString();
  await db.insertInto("users").values({ id, fingerprint, username, created_at }).execute();
  res.status(201).json({ id, fingerprint, username, created_at });
});

app.put("/api/users/:id", async (req, res) => {
  const { username } = req.body;
  if (username === undefined) return fail(res, 400, "Nothing to update");
  const updated = await db
    .updateTable("users")
    .set({ username })
    .where("id", "=", req.params.id)
    .execute();
  if (!updated.length) return fail(res, 404, "User not found");
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", req.params.id)
    .executeTakeFirst();
  res.json(user);
});

// ---------------------------------------------------------------------------
// Events (rooms) — created by a host, joined by guests via code or slug.
// ---------------------------------------------------------------------------
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const makeCode = () => `GAIA-${Math.floor(1000 + Math.random() * 9000)}`;

async function findEvent(identifier: string) {
  return db
    .selectFrom("events")
    .selectAll()
    .where(
      sql<boolean>`id = ${identifier} OR slug = ${identifier} OR code = ${identifier}`
    )
    .executeTakeFirst();
}

app.get("/api/events/:id", async (req, res) => {
  const event = await findEvent(req.params.id);
  if (!event) return fail(res, 404, "Event not found");
  res.json(event);
});

app.post("/api/events", async (req, res) => {
  const { name, host_user_id, mode = "background" } = req.body;
  if (!name || !host_user_id)
    return fail(res, 400, "name and host_user_id are required");
  const host = await db
    .selectFrom("users")
    .select("id")
    .where("id", "=", host_user_id)
    .executeTakeFirst();
  if (!host) return fail(res, 400, "Host user not found");

  // unique slug
  let base = slugify(name) || "event";
  let slug = base;
  while (await db.selectFrom("events").select("id").where("slug", "=", slug).executeTakeFirst()) {
    slug = `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  // unique code
  let code = makeCode();
  while (await db.selectFrom("events").select("id").where("code", "=", code).executeTakeFirst()) {
    code = makeCode();
  }

  const id = randomUUID();
  const created_at = new Date().toISOString();
  await db
    .insertInto("events")
    .values({ id, name, slug, code, host_user_id, mode, created_at })
    .execute();
  res.status(201).json({ id, name, slug, code, host_user_id, mode, created_at });
});

app.put("/api/events/:id", async (req, res) => {
  const event = await findEvent(req.params.id);
  if (!event) return fail(res, 404, "Event not found");
  const updates: Record<string, unknown> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.mode !== undefined) {
    if (!["icebreaker", "background", "high_energy"].includes(req.body.mode))
      return fail(res, 400, "Invalid mode");
    updates.mode = req.body.mode;
  }
  if (!Object.keys(updates).length) return fail(res, 400, "Nothing to update");
  await db.updateTable("events").set(updates).where("id", "=", event.id).execute();
  res.json(await findEvent(event.id));
});

// ---------------------------------------------------------------------------
// Event songs — the crowd-curated pool, ranked by relevance score.
// ---------------------------------------------------------------------------

// Returns the ranked pool joined with song metadata, vote counts, and (if a
// user is supplied) whether that user has voted.
app.get("/api/events/:id/songs", async (req, res) => {
  const event = await findEvent(req.params.id);
  if (!event) return fail(res, 404, "Event not found");
  const userId = req.query.user_id as string | undefined;
  res.json(await fetchPool(event.id, userId));
});

// Upsert a track into the songs table by its source id; return the songs.id.
async function upsertSong(track: GaiaTrack): Promise<string> {
  const existing = await db
    .selectFrom("songs")
    .select("id")
    .where("spotify_id", "=", track.spotify_id)
    .executeTakeFirst();
  if (existing) return existing.id;
  const id = randomUUID();
  await db
    .insertInto("songs")
    .values({
      id,
      spotify_id: track.spotify_id,
      title: track.title,
      artist: track.artist ?? null,
      album: track.album ?? null,
      duration_ms: track.duration_ms ?? null,
      thumbnail_url: track.thumbnail_url ?? null,
      genres: track.genres ?? null,
      preview_url: track.preview_url ?? null,
      rank: track.rank ?? null,
      tempo: track.tempo ?? null,
    })
    .execute();
  return id;
}

// Link a song into an event's pool (idempotent). Returns the event_song id and
// whether it was newly created.
async function linkSongToEvent(
  eventId: string,
  songId: string,
  addedBy: string
): Promise<{ id: string; created: boolean }> {
  const already = await db
    .selectFrom("event_songs")
    .select("id")
    .where("event_id", "=", eventId)
    .where("song_id", "=", songId)
    .executeTakeFirst();
  if (already) return { id: already.id, created: false };
  const id = randomUUID();
  await db
    .insertInto("event_songs")
    .values({
      id,
      event_id: eventId,
      song_id: songId,
      added_by: addedBy,
      status: "queued",
      score: 0,
      created_at: new Date().toISOString(),
    })
    .execute();
  return { id, created: true };
}

// Add a single song to the event pool (guest picked a specific track).
app.post("/api/events/:id/songs", async (req, res) => {
  const event = await findEvent(req.params.id);
  if (!event) return fail(res, 404, "Event not found");
  const { user_id, song } = req.body;
  if (!user_id || !song?.spotify_id)
    return fail(res, 400, "user_id and song.spotify_id are required");

  const songId = await upsertSong(song as GaiaTrack);
  const { id: eventSongId, created } = await linkSongToEvent(
    event.id,
    songId,
    user_id
  );
  await castVote(eventSongId, user_id); // adding implies a vote
  await recomputeScores(db, event.id);
  await broadcastPool(event.id);

  const rel = await db
    .selectFrom("event_songs")
    .selectAll()
    .where("id", "=", eventSongId)
    .executeTakeFirst();
  res.status(created ? 201 : 200).json(rel);
});

// Toggle a vote for the current user on an event song.
app.post("/api/event_songs/:id/vote", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return fail(res, 400, "user_id is required");
  const es = await db
    .selectFrom("event_songs")
    .selectAll()
    .where("id", "=", req.params.id)
    .executeTakeFirst();
  if (!es) return fail(res, 404, "Event song not found");

  const existing = await db
    .selectFrom("votes")
    .select("id")
    .where("event_song_id", "=", es.id)
    .where("user_id", "=", user_id)
    .executeTakeFirst();

  if (existing) {
    await db.deleteFrom("votes").where("id", "=", existing.id).execute();
  } else {
    await castVote(es.id, user_id);
  }
  await recomputeScores(db, es.event_id);
  await broadcastPool(es.event_id);

  const count = await db
    .selectFrom("votes")
    .select(sql<number>`count(*)`.as("c"))
    .where("event_song_id", "=", es.id)
    .executeTakeFirst();
  res.json({ event_song_id: es.id, voted: !existing, vote_count: Number(count?.c ?? 0) });
});

async function castVote(eventSongId: string, userId: string) {
  const dup = await db
    .selectFrom("votes")
    .select("id")
    .where("event_song_id", "=", eventSongId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (dup) return;
  await db
    .insertInto("votes")
    .values({
      id: randomUUID(),
      event_song_id: eventSongId,
      user_id: userId,
      created_at: new Date().toISOString(),
    })
    .execute();
}

// Update a song's playback status (host/auto-DJ marks playing/played).
app.put("/api/event_songs/:id", async (req, res) => {
  const { status } = req.body;
  if (!["queued", "playing", "played"].includes(status))
    return fail(res, 400, "Invalid status");
  const es = await db
    .selectFrom("event_songs")
    .selectAll()
    .where("id", "=", req.params.id)
    .executeTakeFirst();
  if (!es) return fail(res, 404, "Event song not found");
  await db.updateTable("event_songs").set({ status }).where("id", "=", es.id).execute();
  await broadcastPool(es.event_id);
  res.json(await db.selectFrom("event_songs").selectAll().where("id", "=", es.id).executeTakeFirst());
});

app.delete("/api/event_songs/:id", async (req, res) => {
  const es = await db
    .selectFrom("event_songs")
    .select(["id", "event_id"])
    .where("id", "=", req.params.id)
    .executeTakeFirst();
  if (!es) return fail(res, 404, "Event song not found");
  await db.deleteFrom("event_songs").where("id", "=", es.id).execute();
  await broadcastPool(es.event_id);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Deezer — music source (keyless). Search, genre palette, filter-discovery.
// ---------------------------------------------------------------------------

// Free-text track search (guest wants a specific song).
app.get("/api/music/search", async (req, res) => {
  const q = (req.query.q as string)?.trim();
  if (!q) return fail(res, 400, "q is required");
  try {
    res.json(await searchTracks(q, Number(req.query.limit) || 15));
  } catch (e) {
    fail(res, 502, `Music search failed: ${(e as Error).message}`);
  }
});

// Genre palette guests pick from (regional genres double as "regions").
app.get("/api/music/genres", async (_req, res) => {
  try {
    res.json(await listGenres());
  } catch (e) {
    fail(res, 502, `Genres failed: ${(e as Error).message}`);
  }
});

// Preview a candidate pool for given taste filters WITHOUT adding (so guests
// can see what their taste yields before committing).
app.post("/api/music/discover", async (req, res) => {
  try {
    const { genreIds, artists, query } = req.body ?? {};
    res.json(await discover({ genreIds, artists, query }));
  } catch (e) {
    fail(res, 502, `Discover failed: ${(e as Error).message}`);
  }
});

// GAIA's differentiator: a guest submits taste filters, GAIA discovers a
// candidate pool and adds the top N into the event — each counted as that
// guest's vote, so the crowd-relevance engine ranks them immediately.
app.post("/api/events/:id/discover", async (req, res) => {
  const event = await findEvent(req.params.id);
  if (!event) return fail(res, 404, "Event not found");
  const { user_id, genreIds, artists, query, take = 8 } = req.body ?? {};
  if (!user_id) return fail(res, 400, "user_id is required");

  try {
    const candidates = await discover({ genreIds, artists, query });
    const added: string[] = [];
    for (const track of candidates.slice(0, take)) {
      const songId = await upsertSong(track);
      const { id } = await linkSongToEvent(event.id, songId, user_id);
      await castVote(id, user_id); // this guest's taste = a vote for each
      added.push(id);
    }
    await recomputeScores(db, event.id);
    await broadcastPool(event.id);
    res.status(201).json({ added: added.length });
  } catch (e) {
    fail(res, 502, `Discover failed: ${(e as Error).message}`);
  }
});

// Auto-DJ: mark the given song played (if any) and return the next track to
// play, chosen mode-aware by the scoring engine. The host player calls this
// when a track ends.
app.post("/api/events/:id/next", async (req, res) => {
  const event = await findEvent(req.params.id);
  if (!event) return fail(res, 404, "Event not found");
  const { finished_id } = req.body ?? {};

  if (finished_id) {
    await db
      .updateTable("event_songs")
      .set({ status: "played" })
      .where("id", "=", finished_id)
      .where("event_id", "=", event.id)
      .execute();
    await recomputeScores(db, event.id);
  }

  const nextId = await pickNext(db, event.id);
  if (nextId) {
    await db
      .updateTable("event_songs")
      .set({ status: "playing" })
      .where("id", "=", nextId)
      .execute();
  }
  await broadcastPool(event.id);

  if (!nextId) {
    res.json({ next: null });
    return;
  }
  const next = await fetchPool(event.id).then((p) =>
    p.find((s) => s.id === nextId)
  );
  res.json({ next });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Unhandled error guard so a bad request never takes the server down.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: (err as Error).message });
});

const server = http.createServer(app);
attachRealtime(server);
if (require.main === module) {
  server.listen(port, () => console.log(`GAIA server running at http://localhost:${port}`));
} else {
  server.listen(0, "127.0.0.1");
}

export default server;
