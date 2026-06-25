import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEvent } from "@/lib/gaia";

export default function Landing() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    setErr("");
    try {
      const ev = await getEvent(c.startsWith("GAIA-") ? c : `GAIA-${c}`);
      nav(`/r/${ev.code}`);
    } catch {
      setErr("No room with that code. Check the screen and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6">
      {/* Wordmark */}
      <div className="rise-in text-center mb-10" style={{ animationDelay: "0ms" }}>
        <div className="flex items-end justify-center gap-1 mb-5">
          {[0.5, 0.8, 1, 0.7, 0.9].map((h, i) => (
            <span
              key={i}
              className="eq-bar block w-1.5 rounded-full energy-fill"
              style={{ height: `${h * 34}px`, animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
        <h1 className="font-display text-7xl font-black tracking-tight gradient-text leading-none">
          GAIA
        </h1>
        <p className="mt-4 text-muted text-lg max-w-sm mx-auto leading-snug">
          The room picks the music. Together.
        </p>
      </div>

      {/* Join */}
      <form
        onSubmit={join}
        className="rise-in glass rounded-3xl p-6 w-full max-w-sm"
        style={{ animationDelay: "120ms" }}
      >
        <label className="block text-xs uppercase tracking-[0.2em] text-faint mb-2">
          Got a room code?
        </label>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="GAIA-0000"
            autoCapitalize="characters"
            className="flex-1 min-w-0 bg-ink-2/60 border border-white/10 rounded-xl px-4 py-3 text-lg font-display tracking-wider outline-none focus:border-magenta/60 transition"
          />
          <button
            disabled={busy}
            className="shrink-0 energy-fill text-ink font-semibold px-5 rounded-xl disabled:opacity-50 active:scale-95 transition"
          >
            {busy ? "…" : "Join"}
          </button>
        </div>
        {err && <p className="text-flame text-sm mt-3">{err}</p>}
      </form>

      <div className="rise-in mt-6 text-center" style={{ animationDelay: "220ms" }}>
        <span className="text-faint text-sm">Hosting a gathering? </span>
        <button
          onClick={() => nav("/host")}
          className="text-amber font-semibold text-sm underline-offset-4 hover:underline"
        >
          Start a room →
        </button>
      </div>
    </div>
  );
}
