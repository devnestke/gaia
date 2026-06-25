import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  createEvent,
  setEventMode,
  advanceDJ,
  getFingerprint,
  createUser,
  type GaiaEvent,
  type EventMode,
  type PoolSong,
} from "@/lib/gaia";
import { usePool } from "@/lib/hooks";

const MODES: { id: EventMode; label: string; hint: string }[] = [
  { id: "icebreaker", label: "Icebreaker", hint: "Familiar crowd-pleasers" },
  { id: "background", label: "Background", hint: "Easy, unobtrusive" },
  { id: "high_energy", label: "High Energy", hint: "Loud and lively" },
];

export default function Host() {
  const [event, setEvent] = useState<GaiaEvent | undefined>();
  if (!event) return <CreateForm onCreated={setEvent} />;
  return <ControlRoom event={event} setEvent={setEvent} />;
}

function CreateForm({ onCreated }: { onCreated: (e: GaiaEvent) => void }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<EventMode>("icebreaker");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const host = await createUser(getFingerprint(), "Host");
      const ev = await createEvent(name.trim(), host.id, mode);
      onCreated(ev);
    } catch (e) {
      console.error(e);
      setErr(
        "Couldn't reach GAIA. Make sure the server is running on port 3001, then try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <form onSubmit={submit} className="rise-in glass rounded-3xl p-8 w-full max-w-md">
        <h1 className="font-display text-4xl font-bold mb-1">Start a room</h1>
        <p className="text-muted mb-6">Name it, set the vibe, share the code.</p>

        <label className="block text-xs uppercase tracking-[0.2em] text-faint mb-2">
          Event name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Friday Team Mixer"
          className="w-full bg-ink-2/60 border border-white/10 rounded-xl px-4 py-3 mb-6 outline-none focus:border-magenta/60 transition"
        />

        <label className="block text-xs uppercase tracking-[0.2em] text-faint mb-2">
          Vibe
        </label>
        <div className="grid grid-cols-3 gap-2 mb-7">
          {MODES.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-xl px-2 py-3 text-sm border transition text-left ${
                mode === m.id
                  ? "energy-fill text-ink border-transparent"
                  : "border-white/10 text-muted hover:border-white/25"
              }`}
            >
              <div className="font-semibold leading-tight">{m.label}</div>
              <div className={`text-[10px] mt-0.5 ${mode === m.id ? "text-ink/70" : "text-faint"}`}>
                {m.hint}
              </div>
            </button>
          ))}
        </div>

        <button
          disabled={busy}
          className="energy-fill text-ink font-bold w-full py-3.5 rounded-xl disabled:opacity-50 active:scale-[0.98] transition"
        >
          {busy ? "Creating…" : "Open the room"}
        </button>
        {err && <p className="text-flame text-sm mt-3 text-center">{err}</p>}
      </form>
    </div>
  );
}

function ControlRoom({
  event,
  setEvent,
}: {
  event: GaiaEvent;
  setEvent: (e: GaiaEvent) => void;
}) {
  const { pool } = usePool(event.code, undefined, 2500);
  const joinUrl = `${window.location.origin}/r/${event.code}`;
  const [qr, setQr] = useState("");

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      margin: 1,
      color: { dark: "#0a0814", light: "#f4f0ff" },
      width: 320,
    }).then(setQr);
  }, [joinUrl]);

  async function changeMode(mode: EventMode) {
    const updated = await setEventMode(event.id, mode);
    setEvent(updated);
  }

  const queue = useMemo(() => pool.filter((s) => s.status !== "played"), [pool]);
  const maxVotes = Math.max(1, ...queue.map((s) => s.vote_count));

  return (
    <div className="min-h-dvh px-6 py-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl font-black gradient-text">GAIA</span>
            <span className="text-faint">/</span>
            <h1 className="text-xl font-semibold">{event.name}</h1>
          </div>
          <p className="text-faint text-sm mt-0.5">{queue.length} in the queue · live</p>
        </div>
        <div className="flex gap-1.5 glass rounded-full p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => changeMode(m.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                event.mode === m.id ? "energy-fill text-ink" : "text-muted hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid lg:grid-cols-[340px_1fr] gap-8">
        {/* Join panel */}
        <aside className="glass rounded-3xl p-6 h-fit lg:sticky lg:top-8">
          <p className="text-xs uppercase tracking-[0.2em] text-faint mb-3">Scan to join</p>
          {qr && (
            <img
              src={qr}
              alt="Join QR"
              className="w-full rounded-2xl energy-ring"
              style={{ imageRendering: "pixelated" }}
            />
          )}
          <div className="mt-5 text-center">
            <p className="text-faint text-xs uppercase tracking-[0.2em]">or enter code</p>
            <p className="font-display text-4xl font-black gradient-text tracking-wider mt-1">
              {event.code.replace("GAIA-", "")}
            </p>
            <p className="text-faint text-xs mt-2 break-all">{joinUrl}</p>
          </div>
        </aside>

        {/* Player + queue */}
        <main>
          <Player eventRef={event.code} queue={queue} />
          <h2 className="text-sm uppercase tracking-[0.2em] text-faint mt-8 mb-3">
            Up next — ranked by the room
          </h2>
          <ol className="space-y-2">
            {queue.length === 0 && (
              <li className="text-muted text-sm py-8 text-center glass rounded-2xl">
                Waiting for guests to add their taste…
              </li>
            )}
            {queue.map((s, i) => (
              <QueueRow key={s.id} song={s} rank={i} maxVotes={maxVotes} />
            ))}
          </ol>
        </main>
      </div>
    </div>
  );
}

function QueueRow({ song, rank, maxVotes }: { song: PoolSong; rank: number; maxVotes: number }) {
  const glow = song.vote_count / maxVotes;
  return (
    <li
      className="rise-in crowd-glow glass rounded-2xl px-4 py-3 flex items-center gap-4"
      style={{ ["--glow" as string]: glow.toFixed(2) }}
    >
      <span className="font-display text-2xl font-black text-faint w-7 text-center">
        {rank + 1}
      </span>
      {song.thumbnail_url ? (
        <img src={song.thumbnail_url} className="w-12 h-12 rounded-lg object-cover" alt="" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-mist" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate">{song.title}</p>
        <p className="text-muted text-sm truncate">
          {song.artist}
          {song.genres ? ` · ${song.genres}` : ""}
        </p>
      </div>
      <div className="text-right">
        <span className="font-display text-xl font-bold gradient-text">{song.vote_count}</span>
        <p className="text-faint text-[10px] uppercase tracking-wider">votes</p>
      </div>
    </li>
  );
}

/**
 * Server-driven auto-DJ. The host asks the server for the next track (chosen
 * mode-aware), plays its 30s preview, and on end reports it finished to get the
 * following pick. Order is decided server-side, not by naive top-of-queue.
 */
function Player({ eventRef, queue }: { eventRef: string; queue: PoolSong[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<PoolSong | null>(null);
  const startingRef = useRef(false);

  // Play whatever the auto-DJ returns; finishedId reports the track that ended.
  const playNext = useCallback(
    async (finishedId?: string) => {
      try {
        const { next } = await advanceDJ(eventRef, finishedId);
        setCurrent(next);
        if (next?.preview_url) {
          const a = audioRef.current!;
          a.src = next.preview_url;
          await a.play().catch(() => setPlaying(false));
        } else {
          setPlaying(false); // nothing left to play
        }
      } catch (e) {
        console.error("auto-DJ advance failed", e);
        setPlaying(false);
      }
    },
    [eventRef]
  );

  async function toggle() {
    const a = audioRef.current!;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if (current?.preview_url) {
      a.play().catch(() => setPlaying(false)); // resume
    } else if (!startingRef.current) {
      startingRef.current = true;
      await playNext();
      startingRef.current = false;
    }
  }

  const hasSomething = current || queue.length > 0;

  return (
    <div className="glass rounded-3xl p-6 flex items-center gap-5 energy-ring">
      <button
        onClick={toggle}
        disabled={!hasSomething}
        className="energy-fill text-ink w-16 h-16 rounded-full grid place-items-center text-2xl shrink-0 disabled:opacity-40 active:scale-95 transition"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-[0.2em] text-faint mb-1">
          {playing ? "Now playing · auto-DJ (30s preview)" : "Tap play — GAIA takes over"}
        </p>
        <p className="font-display text-2xl font-bold truncate">
          {current?.title ?? (queue[0]?.title ?? "Nothing yet")}
        </p>
        <p className="text-muted truncate">
          {current?.artist ?? queue[0]?.artist ?? "Add some music to begin"}
        </p>
      </div>
      {playing && (
        <div className="flex items-end gap-1 h-8">
          {[0.6, 1, 0.7, 0.9].map((h, i) => (
            <span
              key={i}
              className="eq-bar w-1.5 rounded-full energy-fill"
              style={{ height: `${h * 32}px`, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      )}
      <audio ref={audioRef} onEnded={() => playNext(current?.id)} />
    </div>
  );
}
