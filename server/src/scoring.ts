import { sql, type Kysely } from "kysely";
import type { Database, EventMode } from "./types/db";

/**
 * GAIA crowd-relevance scoring.
 *
 * A song rises by how many DISTINCT people in the room want it, not by how
 * loudly one person spams it. Recomputed whenever votes change.
 *
 *   score = votes * VOTE_WEIGHT          // the crowd is the primary signal
 *         + popularityBias(rank, mode)   // light nudge from familiarity
 *         - playedPenalty                // played songs sink
 *
 * Note: Deezer gives no energy/valence/danceability, so "mode" biases on
 * popularity (rank) — a proxy for how recognizable a track is. Icebreakers and
 * high-energy moments favor crowd-pleasers; background mode is happy to dig for
 * lesser-known tracks. The crowd vote always dominates the popularity nudge.
 */

const VOTE_WEIGHT = 10;
const MAX_POP_BIAS = 4; // capped so popularity never overrides the room

// Deezer ranks span ~0..1,000,000. Normalize to 0..1 (log-scaled — rank is
// heavily skewed toward big hits).
function normRank(rank: number | null): number {
  if (!rank || rank <= 0) return 0;
  const n = Math.log10(rank) / 6; // 10^6 ≈ top hit
  return Math.max(0, Math.min(1, n));
}

function popularityBias(mode: EventMode, rank: number | null): number {
  const pop = normRank(rank);
  switch (mode) {
    case "icebreaker":
    case "high_energy":
      // favor recognizable crowd-pleasers
      return pop * MAX_POP_BIAS;
    case "background":
    default:
      // neutral-to-slightly-favoring deeper cuts; near-zero influence
      return (1 - pop) * (MAX_POP_BIAS / 2);
  }
}

/**
 * Pick the next track the auto-DJ should play.
 *
 * Starts from the highest-scored queued songs, then applies mode-aware
 * refinement the raw score can't capture:
 *   - never repeat the artist that just played (keeps variety)
 *   - icebreaker / high_energy: among the top contenders, prefer the most
 *     recognizable (rank); background: prefer the least "in your face".
 * Returns the event_song id to play next, or null if the queue is empty.
 */
export async function pickNext(
  db: Kysely<Database>,
  eventId: string
): Promise<string | null> {
  const event = await db
    .selectFrom("events")
    .select("mode")
    .where("id", "=", eventId)
    .executeTakeFirst();
  const mode = (event?.mode ?? "background") as EventMode;

  // artist of the most recently played track (avoid back-to-back repeats)
  const lastPlayed = await db
    .selectFrom("event_songs as es")
    .innerJoin("songs as s", "s.id", "es.song_id")
    .select("s.artist as artist")
    .where("es.event_id", "=", eventId)
    .where("es.status", "=", "played")
    .orderBy("es.created_at", "desc")
    .executeTakeFirst();

  const queued = await db
    .selectFrom("event_songs as es")
    .innerJoin("songs as s", "s.id", "es.song_id")
    .select(["es.id as id", "es.score as score", "s.artist as artist", "s.rank as rank"])
    .where("es.event_id", "=", eventId)
    .where("es.status", "=", "queued")
    .orderBy("es.score", "desc")
    .limit(6) // consider the top contenders, not just #1
    .execute();

  if (queued.length === 0) return null;

  // drop the just-played artist if other options exist
  let pool = queued;
  if (lastPlayed?.artist) {
    const filtered = queued.filter((q) => q.artist !== lastPlayed.artist);
    if (filtered.length) pool = filtered;
  }

  // keep only those within a small score band of the leader, then break ties
  const top = pool[0].score;
  const band = pool.filter((q) => top - q.score <= VOTE_WEIGHT); // ~within one vote
  const favorPopular = mode === "icebreaker" || mode === "high_energy";
  band.sort((a, b) =>
    favorPopular ? (b.rank ?? 0) - (a.rank ?? 0) : (a.rank ?? 0) - (b.rank ?? 0)
  );
  return band[0].id;
}

export async function recomputeScores(
  db: Kysely<Database>,
  eventId: string
): Promise<void> {
  const event = await db
    .selectFrom("events")
    .select("mode")
    .where("id", "=", eventId)
    .executeTakeFirst();
  const mode = (event?.mode ?? "background") as EventMode;

  const rows = await db
    .selectFrom("event_songs as es")
    .innerJoin("songs as s", "s.id", "es.song_id")
    .select(["es.id as id", "es.status as status", "s.rank as rank"])
    .select((eb) => [
      eb
        .selectFrom("votes")
        .select(sql<number>`count(*)`.as("c"))
        .whereRef("votes.event_song_id", "=", "es.id")
        .as("votes"),
    ])
    .where("es.event_id", "=", eventId)
    .execute();

  for (const r of rows) {
    const votes = Number(r.votes ?? 0);
    let score = votes * VOTE_WEIGHT + popularityBias(mode, r.rank);
    if (r.status === "played") score -= 1000; // sink played tracks
    await db.updateTable("event_songs").set({ score }).where("id", "=", r.id).execute();
  }
}
