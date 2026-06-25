export type EventMode = "icebreaker" | "background" | "high_energy";
export type SongStatus = "queued" | "playing" | "played";

export interface Database {
  users: {
    id: string;
    fingerprint: string;
    username: string;
    created_at: string;
  };
  events: {
    id: string;
    name: string;
    slug: string;
    code: string;
    host_user_id: string;
    mode: EventMode;
    created_at: string;
  };
  songs: {
    id: string;
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
  };
  event_songs: {
    id: string;
    event_id: string;
    song_id: string;
    added_by: string;
    status: SongStatus;
    score: number;
    created_at: string;
  };
  votes: {
    id: string;
    event_song_id: string;
    user_id: string;
    created_at: string;
  };
}
