import { Server as IOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { sql } from "kysely";
import db from "./db";

let io: IOServer | undefined;

/** A guest/host subscribes to an event room to receive live pool updates. */
export function attachRealtime(server: HttpServer) {
  io = new IOServer(server, { cors: { origin: "*" } });
  io.on("connection", (socket) => {
    socket.on("join", (eventId: string) => {
      if (typeof eventId === "string") socket.join(eventId);
    });
    socket.on("leave", (eventId: string) => {
      if (typeof eventId === "string") socket.leave(eventId);
    });
  });
  return io;
}

/**
 * The ranked pool for an event, joined with metadata + vote counts.
 * Shared by the REST GET route and the realtime broadcaster so both return
 * identical shapes. `userId` annotates has_voted for that viewer.
 */
export async function fetchPool(eventId: string, userId?: string) {
  const rows = await db
    .selectFrom("event_songs as es")
    .innerJoin("songs as s", "s.id", "es.song_id")
    .select([
      "es.id as id",
      "es.status as status",
      "es.score as score",
      "es.added_by as added_by",
      "es.created_at as created_at",
      "s.id as song_id",
      "s.spotify_id as spotify_id",
      "s.title as title",
      "s.artist as artist",
      "s.album as album",
      "s.duration_ms as duration_ms",
      "s.thumbnail_url as thumbnail_url",
      "s.genres as genres",
      "s.preview_url as preview_url",
      "s.rank as rank",
    ])
    .select((eb) => [
      eb
        .selectFrom("votes")
        .select(sql<number>`count(*)`.as("c"))
        .whereRef("votes.event_song_id", "=", "es.id")
        .as("vote_count"),
    ])
    .where("es.event_id", "=", eventId)
    .orderBy("es.score", "desc")
    .orderBy("es.created_at", "asc")
    .execute();

  let votedSet = new Set<string>();
  if (userId) {
    const voted = await db
      .selectFrom("votes")
      .innerJoin("event_songs", "event_songs.id", "votes.event_song_id")
      .select("votes.event_song_id as id")
      .where("event_songs.event_id", "=", eventId)
      .where("votes.user_id", "=", userId)
      .execute();
    votedSet = new Set(voted.map((v) => v.id));
  }

  return rows.map((r) => ({
    ...r,
    vote_count: Number(r.vote_count ?? 0),
    has_voted: votedSet.has(r.id),
  }));
}

/**
 * Push the fresh ranked pool to everyone in the event room. We omit per-viewer
 * has_voted here (clients reconcile their own vote locally); the array is the
 * authoritative ranking + counts.
 */
export async function broadcastPool(eventId: string) {
  if (!io) return;
  const pool = await fetchPool(eventId);
  io.to(eventId).emit("pool", pool);
}
