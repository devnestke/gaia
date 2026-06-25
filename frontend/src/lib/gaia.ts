/**
 * GAIA API client. Small hand-written wrapper over the Express backend.
 */

export const API =
  import.meta.env.VITE_API_HOST?.replace(/\/$/, "") || "http://localhost:3001";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- types -----------------------------------------------------------------
export type EventMode = "icebreaker" | "background" | "high_energy";

export interface User {
  id: string;
  fingerprint: string;
  username: string;
}

export interface GaiaEvent {
  id: string;
  name: string;
  slug: string;
  code: string;
  host_user_id: string;
  mode: EventMode;
}

export interface Track {
  spotify_id: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
  thumbnail_url: string | null;
  genres: string | null;
  preview_url: string | null;
  rank: number | null;
  tempo: number | null;
}

export interface Genre {
  id: number;
  name: string;
}

export interface PoolSong {
  id: string; // event_song id
  status: "queued" | "playing" | "played";
  score: number;
  added_by: string;
  created_at: string;
  song_id: string;
  spotify_id: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
  thumbnail_url: string | null;
  genres: string | null;
  preview_url: string | null;
  rank: number | null;
  vote_count: number;
  has_voted: boolean;
}

// ---- users -----------------------------------------------------------------
export const createUser = (fingerprint: string, username: string) =>
  req<User>("/api/users", {
    method: "POST",
    body: JSON.stringify({ fingerprint, username }),
  });

export const getUser = (idOrFingerprint: string) =>
  req<User>(`/api/users/${idOrFingerprint}`);

export const renameUser = (id: string, username: string) =>
  req<User>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify({ username }),
  });

// ---- events ----------------------------------------------------------------
export const createEvent = (name: string, host_user_id: string, mode: EventMode) =>
  req<GaiaEvent>("/api/events", {
    method: "POST",
    body: JSON.stringify({ name, host_user_id, mode }),
  });

export const getEvent = (idOrCodeOrSlug: string) =>
  req<GaiaEvent>(`/api/events/${idOrCodeOrSlug}`);

export const setEventMode = (id: string, mode: EventMode) =>
  req<GaiaEvent>(`/api/events/${id}`, {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });

// ---- pool / songs ----------------------------------------------------------
export const getPool = (eventRef: string, userId?: string) =>
  req<PoolSong[]>(
    `/api/events/${eventRef}/songs${userId ? `?user_id=${userId}` : ""}`
  );

export const addSong = (eventRef: string, userId: string, song: Track) =>
  req(`/api/events/${eventRef}/songs`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, song }),
  });

export const toggleVote = (eventSongId: string, userId: string) =>
  req<{ event_song_id: string; voted: boolean; vote_count: number }>(
    `/api/event_songs/${eventSongId}/vote`,
    { method: "POST", body: JSON.stringify({ user_id: userId }) }
  );

export const setSongStatus = (
  eventSongId: string,
  status: "queued" | "playing" | "played"
) =>
  req(`/api/event_songs/${eventSongId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

// Auto-DJ: report the finished track, get the mode-aware next pick.
export const advanceDJ = (eventRef: string, finishedId?: string) =>
  req<{ next: PoolSong | null }>(`/api/events/${eventRef}/next`, {
    method: "POST",
    body: JSON.stringify({ finished_id: finishedId }),
  });

// ---- music / discovery -----------------------------------------------------
export const searchMusic = (q: string) =>
  req<Track[]>(`/api/music/search?q=${encodeURIComponent(q)}`);

export const listGenres = () => req<Genre[]>("/api/music/genres");

export interface DiscoverPayload {
  genreIds?: Genre[];
  artists?: string[];
  query?: string;
}

export const previewDiscover = (payload: DiscoverPayload) =>
  req<Track[]>("/api/music/discover", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const discoverIntoEvent = (
  eventRef: string,
  userId: string,
  payload: DiscoverPayload & { take?: number }
) =>
  req<{ added: number }>(`/api/events/${eventRef}/discover`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...payload }),
  });

// ---- local identity (anonymous guest) --------------------------------------
const FP_KEY = "gaia-fingerprint";
const NICK_KEY = "gaia-nickname";

export function getFingerprint(): string {
  let fp = localStorage.getItem(FP_KEY);
  if (!fp) {
    fp = `g-${crypto.randomUUID()}`;
    localStorage.setItem(FP_KEY, fp);
  }
  return fp;
}

export const savedNickname = () => localStorage.getItem(NICK_KEY) || "";
export const saveNickname = (n: string) => localStorage.setItem(NICK_KEY, n);
