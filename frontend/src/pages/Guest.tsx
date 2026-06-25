import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getEvent,
  listGenres,
  discoverIntoEvent,
  searchMusic,
  addSong,
  toggleVote,
  saveNickname,
  savedNickname,
  type GaiaEvent,
  type Genre,
  type Track,
} from "@/lib/gaia";
import { useGaiaUser, usePool } from "@/lib/hooks";

// Regional genres from Deezer that double as "regions" — surfaced first.
const REGION_HINT = new Set([
  "African Music",
  "Latin Music",
  "Asian Music",
  "Brazilian Music",
  "Indian Music",
  "Reggae",
]);

export default function Guest() {
  const { code } = useParams<{ code: string }>();
  const [event, setEvent] = useState<GaiaEvent | undefined>();
  const [nick, setNick] = useState(savedNickname());
  const [joined, setJoined] = useState(!!savedNickname());
  const user = useGaiaUser(joined ? nick : undefined);

  useEffect(() => {
    if (code) getEvent(code).then(setEvent).catch(() => setEvent(undefined));
  }, [code]);

  if (!event)
    return <Centered>Looking for room {code}…</Centered>;

  if (!joined)
    return (
      <Centered>
        <div className="glass rounded-3xl p-7 w-full max-w-sm rise-in">
          <p className="text-amber text-sm font-semibold">{event.name}</p>
          <h1 className="font-display text-3xl font-bold mt-1 mb-5">What should we call you?</h1>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="e.g. Sam"
            className="w-full bg-ink-2/60 border border-white/10 rounded-xl px-4 py-3 mb-4 outline-none focus:border-magenta/60"
          />
          <button
            onClick={() => {
              if (!nick.trim()) return;
              saveNickname(nick.trim());
              setJoined(true);
            }}
            className="energy-fill text-ink font-bold w-full py-3.5 rounded-xl active:scale-[0.98] transition"
          >
            Join the room
          </button>
        </div>
      </Centered>
    );

  return <Room event={event} userId={user?.id} nick={nick} />;
}

function Room({ event, userId, nick }: { event: GaiaEvent; userId?: string; nick: string }) {
  const { pool, refresh } = usePool(event.code, userId, 2500);
  const [tab, setTab] = useState<"taste" | "queue">("taste");

  return (
    <div className="min-h-dvh max-w-lg mx-auto px-5 py-6">
      <header className="flex items-center justify-between mb-5">
        <div>
          <span className="font-display font-black gradient-text text-lg">GAIA</span>
          <p className="text-faint text-xs">{event.name} · hi {nick}</p>
        </div>
        <div className="flex glass rounded-full p-1 text-sm">
          <button
            onClick={() => setTab("taste")}
            className={`px-4 py-1.5 rounded-full transition ${
              tab === "taste" ? "energy-fill text-ink font-semibold" : "text-muted"
            }`}
          >
            Your taste
          </button>
          <button
            onClick={() => setTab("queue")}
            className={`px-4 py-1.5 rounded-full transition ${
              tab === "queue" ? "energy-fill text-ink font-semibold" : "text-muted"
            }`}
          >
            Queue {pool.length ? `· ${pool.length}` : ""}
          </button>
        </div>
      </header>

      {tab === "taste" ? (
        <TastePanel event={event} userId={userId} onDone={() => { refresh(); setTab("queue"); }} />
      ) : (
        <QueuePanel pool={pool} userId={userId} onVote={refresh} />
      )}
    </div>
  );
}

function TastePanel({
  event,
  userId,
  onDone,
}: {
  event: GaiaEvent;
  userId?: string;
  onDone: () => void;
}) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [picked, setPicked] = useState<Genre[]>([]);
  const [artist, setArtist] = useState("");
  const [artists, setArtists] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listGenres().then(setGenres).catch(() => {});
  }, []);

  const regions = genres.filter((g) => REGION_HINT.has(g.name));
  const styles = genres.filter((g) => !REGION_HINT.has(g.name));

  function toggleGenre(g: Genre) {
    setPicked((p) =>
      p.find((x) => x.id === g.id) ? p.filter((x) => x.id !== g.id) : [...p, g]
    );
  }

  async function submit() {
    if (!userId || (!picked.length && !artists.length)) return;
    setBusy(true);
    try {
      await discoverIntoEvent(event.code, userId, {
        genreIds: picked,
        artists,
        take: 8,
      });
      onDone();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise-in">
      <h2 className="font-display text-2xl font-bold mb-1">What are you into?</h2>
      <p className="text-muted text-sm mb-5">
        Pick a few — GAIA adds songs you'll love to the room's playlist.
      </p>

      {regions.length > 0 && (
        <>
          <Label>Regions</Label>
          <Chips items={regions} picked={picked} onToggle={toggleGenre} />
        </>
      )}

      <Label>Genres</Label>
      <Chips items={styles} picked={picked} onToggle={toggleGenre} />

      <Label>Favorite artists</Label>
      <div className="flex gap-2 mb-3">
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && artist.trim()) {
              setArtists((a) => [...new Set([...a, artist.trim()])]);
              setArtist("");
            }
          }}
          placeholder="Type a name, press Enter"
          className="flex-1 bg-ink-2/60 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-magenta/60 text-sm"
        />
      </div>
      {artists.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {artists.map((a) => (
            <button
              key={a}
              onClick={() => setArtists((arr) => arr.filter((x) => x !== a))}
              className="energy-fill text-ink text-sm px-3 py-1.5 rounded-full"
            >
              {a} ✕
            </button>
          ))}
        </div>
      )}

      <button
        disabled={busy || (!picked.length && !artists.length)}
        onClick={submit}
        className="energy-fill text-ink font-bold w-full py-3.5 rounded-xl mt-4 disabled:opacity-40 active:scale-[0.98] transition"
      >
        {busy ? "Finding your songs…" : "Add my taste to the room"}
      </button>

      <SearchAdd event={event} userId={userId} />
    </div>
  );
}

function SearchAdd({ event, userId }: { event: GaiaEvent; userId?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setResults(await searchMusic(q.trim()).catch(() => []));
  }
  async function add(t: Track) {
    if (!userId) return;
    await addSong(event.code, userId, t);
    setAdded((s) => new Set(s).add(t.spotify_id));
  }

  return (
    <div className="mt-8 pt-6 border-t border-white/10">
      <Label>Know a specific song?</Label>
      <form onSubmit={run} className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a track"
          className="flex-1 bg-ink-2/60 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-magenta/60 text-sm"
        />
        <button className="glass px-4 rounded-xl text-sm">Search</button>
      </form>
      <div className="space-y-2">
        {results.map((t) => (
          <div key={t.spotify_id} className="glass rounded-xl px-3 py-2 flex items-center gap-3">
            {t.thumbnail_url && (
              <img src={t.thumbnail_url} className="w-9 h-9 rounded object-cover" alt="" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{t.title}</p>
              <p className="text-faint text-xs truncate">{t.artist}</p>
            </div>
            <button
              disabled={added.has(t.spotify_id)}
              onClick={() => add(t)}
              className="text-sm energy-fill text-ink px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              {added.has(t.spotify_id) ? "✓" : "Add"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueuePanel({
  pool,
  userId,
  onVote,
}: {
  pool: import("@/lib/gaia").PoolSong[];
  userId?: string;
  onVote: () => void;
}) {
  const queue = pool.filter((s) => s.status !== "played");
  const maxVotes = Math.max(1, ...queue.map((s) => s.vote_count));

  async function vote(id: string) {
    if (!userId) return;
    await toggleVote(id, userId);
    onVote();
  }

  return (
    <div className="rise-in">
      <h2 className="font-display text-2xl font-bold mb-1">The room's playlist</h2>
      <p className="text-muted text-sm mb-5">Tap the heart to push a song up.</p>
      <ol className="space-y-2">
        {queue.length === 0 && (
          <li className="text-muted text-sm py-8 text-center glass rounded-2xl">
            Nothing yet — add your taste to get it started.
          </li>
        )}
        {queue.map((s, i) => (
          <li
            key={s.id}
            className="crowd-glow glass rounded-2xl px-3 py-2.5 flex items-center gap-3"
            style={{ ["--glow" as string]: (s.vote_count / maxVotes).toFixed(2) }}
          >
            <span className="font-display font-black text-faint w-5 text-center text-sm">
              {i + 1}
            </span>
            {s.thumbnail_url ? (
              <img src={s.thumbnail_url} className="w-11 h-11 rounded-lg object-cover" alt="" />
            ) : (
              <div className="w-11 h-11 rounded-lg bg-mist" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate text-sm">{s.title}</p>
              <p className="text-faint text-xs truncate">{s.artist}</p>
            </div>
            <button
              onClick={() => vote(s.id)}
              className={`flex flex-col items-center px-2.5 py-1 rounded-xl transition active:scale-90 ${
                s.has_voted ? "energy-fill text-ink" : "glass text-muted"
              }`}
            >
              <span className="text-lg leading-none">{s.has_voted ? "♥" : "♡"}</span>
              <span className="text-[11px] font-bold">{s.vote_count}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// --- small helpers ----------------------------------------------------------
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.2em] text-faint mb-2 mt-4">{children}</p>
  );
}

function Chips({
  items,
  picked,
  onToggle,
}: {
  items: Genre[];
  picked: Genre[];
  onToggle: (g: Genre) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {items.map((g) => {
        const on = !!picked.find((x) => x.id === g.id);
        return (
          <button
            key={g.id}
            onClick={() => onToggle(g)}
            className={`px-3.5 py-2 rounded-full text-sm border transition active:scale-95 ${
              on
                ? "energy-fill text-ink border-transparent font-semibold"
                : "border-white/12 text-muted hover:border-white/30"
            }`}
          >
            {g.name}
          </button>
        );
      })}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6 text-muted text-center">
      {children}
    </div>
  );
}
