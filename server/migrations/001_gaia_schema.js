/**
 * GAIA initial schema.
 *
 * events       — a gathering (room) hosts create; guests join by code/slug.
 * users        — anonymous guests (fingerprint + nickname), no login.
 * songs        — Spotify-backed track metadata + audio features for mood filtering.
 * event_songs  — a song in an event's pool, with status + cached relevance score.
 * votes        — one row per (user, event_song); the crowd-relevance signal.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema
    .createTable("users", function (table) {
      table.uuid("id").primary();
      table.string("fingerprint").notNullable().unique();
      table.string("username").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .createTable("events", function (table) {
      table.uuid("id").primary();
      table.string("name").notNullable();
      table.string("slug").notNullable().unique();
      // short human-typeable join code, e.g. "GAIA-4821"
      table.string("code").notNullable().unique();
      table.uuid("host_user_id").notNullable()
        .references("id").inTable("users").onDelete("CASCADE");
      // event vibe that biases the auto-DJ: icebreaker | background | high_energy
      table.string("mode").notNullable().defaultTo("background");
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .createTable("songs", function (table) {
      table.uuid("id").primary();
      table.string("spotify_id").notNullable().unique();
      table.string("title").notNullable();
      table.string("artist");
      table.string("album");
      table.integer("duration_ms");
      table.string("thumbnail_url");
      // genre / region label(s) from the discovery context that surfaced it
      table.string("genres");
      // 30s preview mp3 (Deezer); refreshed before playback as URLs expire
      table.string("preview_url");
      // Deezer popularity rank — a soft relevance signal for scoring/auto-DJ
      table.integer("rank");
      // BPM when Deezer provides it (sparse); 0/null otherwise
      table.float("tempo");
    })
    .createTable("event_songs", function (table) {
      table.uuid("id").primary();
      table.uuid("event_id").notNullable()
        .references("id").inTable("events").onDelete("CASCADE");
      table.uuid("song_id").notNullable()
        .references("id").inTable("songs").onDelete("CASCADE");
      // who first added it
      table.uuid("added_by").notNullable()
        .references("id").inTable("users").onDelete("CASCADE");
      // queued | playing | played
      table.string("status").notNullable().defaultTo("queued");
      // cached crowd-relevance score (recomputed on votes); higher = sooner
      table.float("score").notNullable().defaultTo(0);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.unique(["event_id", "song_id"]);
    })
    .createTable("votes", function (table) {
      table.uuid("id").primary();
      table.uuid("event_song_id").notNullable()
        .references("id").inTable("event_songs").onDelete("CASCADE");
      table.uuid("user_id").notNullable()
        .references("id").inTable("users").onDelete("CASCADE");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      // one vote per user per song
      table.unique(["event_song_id", "user_id"]);
    });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema
    .dropTableIfExists("votes")
    .dropTableIfExists("event_songs")
    .dropTableIfExists("songs")
    .dropTableIfExists("events")
    .dropTableIfExists("users");
}
