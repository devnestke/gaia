/**
 * Deezer music source for GAIA.
 *
 * Keyless public API (api.deezer.com) — no OAuth, no app credentials.
 * We use it for:
 *   - search (guests find a specific track)
 *   - genres (the filter palette, incl. regional genres like "African Music")
 *   - filter-driven discovery (genre charts + artist top tracks -> candidate pool)
 *
 * Caveat: Deezer exposes no energy/valence/danceability and sparse BPM, so
 * GAIA's mood signal comes from genre + popularity (rank) + crowd votes, not
 * audio analysis. Playback uses the 30s `preview` MP3 (URLs are signed and
 * expire after a few hours — always fetch fresh before playing).
 */

const BASE = "https://api.deezer.com";

// Shape GAIA stores/sends to the client. Maps onto the `songs` table.
export interface GaiaTrack {
  spotify_id: string; // reused column name = "<source>:<id>", here "deezer:<id>"
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
  thumbnail_url: string | null;
  genres: string | null; // genre label(s) when known from discovery context
  preview_url: string | null; // 30s mp3
  rank: number | null; // Deezer popularity, used as a soft relevance signal
  tempo: number | null; // BPM when known (sparse on Deezer)
}

interface DeezerTrack {
  id: number;
  title: string;
  duration: number; // seconds
  rank?: number;
  preview?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_medium?: string };
}

interface DeezerList<T> {
  data?: T[];
  error?: { message?: string };
}

async function dz<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Deezer ${res.status} for ${path}`);
  const json = (await res.json()) as T & { error?: { message?: string } };
  if ((json as { error?: { message?: string } }).error) {
    throw new Error(`Deezer error: ${(json as { error: { message?: string } }).error.message}`);
  }
  return json;
}

function toGaia(t: DeezerTrack, genreLabel?: string): GaiaTrack {
  return {
    spotify_id: `deezer:${t.id}`,
    title: t.title,
    artist: t.artist?.name ?? null,
    album: t.album?.title ?? null,
    duration_ms: t.duration ? t.duration * 1000 : null,
    thumbnail_url: t.album?.cover_medium ?? null,
    genres: genreLabel ?? null,
    preview_url: t.preview ?? null,
    rank: t.rank ?? null,
    tempo: null,
  };
}

/** Free-text track search. */
export async function searchTracks(q: string, limit = 15): Promise<GaiaTrack[]> {
  const data = await dz<DeezerList<DeezerTrack>>(
    `/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
  return (data.data ?? []).filter((t) => t.preview).map((t) => toGaia(t));
}

export interface Genre {
  id: number;
  name: string;
}

/** The genre palette guests pick from (regional genres double as "regions"). */
export async function listGenres(): Promise<Genre[]> {
  const data = await dz<DeezerList<{ id: number; name: string }>>(`/genre`);
  return (data.data ?? [])
    .filter((g) => g.id !== 0) // drop the catch-all "All"
    .map((g) => ({ id: g.id, name: g.name }));
}

/** Top chart tracks for a genre — the seed for genre/region filters. */
export async function tracksForGenre(
  genreId: number,
  genreLabel: string,
  limit = 10
): Promise<GaiaTrack[]> {
  const data = await dz<DeezerList<DeezerTrack>>(
    `/chart/${genreId}/tracks?limit=${limit}`
  );
  return (data.data ?? []).filter((t) => t.preview).map((t) => toGaia(t, genreLabel));
}

/** Top tracks for an artist (by name) — the seed for artist filters. */
export async function tracksForArtist(name: string, limit = 8): Promise<GaiaTrack[]> {
  const found = await dz<DeezerList<{ id: number; name: string }>>(
    `/search/artist?q=${encodeURIComponent(name)}&limit=1`
  );
  const artist = found.data?.[0];
  if (!artist) return [];
  const top = await dz<DeezerList<DeezerTrack>>(
    `/artist/${artist.id}/top?limit=${limit}`
  );
  return (top.data ?? []).filter((t) => t.preview).map((t) => toGaia(t, artist.name));
}

/**
 * Filter-driven discovery — GAIA's differentiator.
 * Given a guest's taste signals, assemble a de-duplicated candidate pool.
 */
export interface TasteFilters {
  genreIds?: { id: number; name: string }[];
  artists?: string[];
  query?: string;
}

export async function discover(filters: TasteFilters): Promise<GaiaTrack[]> {
  const batches: GaiaTrack[][] = await Promise.all([
    ...(filters.genreIds ?? []).map((g) =>
      tracksForGenre(g.id, g.name).catch(() => [])
    ),
    ...(filters.artists ?? []).map((a) => tracksForArtist(a).catch(() => [])),
    filters.query ? searchTracks(filters.query).catch(() => []) : Promise.resolve([]),
  ]);

  // de-dupe by track id, keep highest rank
  const byId = new Map<string, GaiaTrack>();
  for (const t of batches.flat()) {
    const existing = byId.get(t.spotify_id);
    if (!existing || (t.rank ?? 0) > (existing.rank ?? 0)) byId.set(t.spotify_id, t);
  }
  return [...byId.values()].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
}
