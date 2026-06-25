import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import {
  getFingerprint,
  createUser,
  getPool,
  API,
  type User,
  type PoolSong,
} from "./gaia";

/** Ensure an anonymous user exists for the given nickname. */
export function useGaiaUser(nickname: string | undefined) {
  const [user, setUser] = useState<User | undefined>();
  useEffect(() => {
    if (!nickname) return;
    let active = true;
    createUser(getFingerprint(), nickname)
      .then((u) => active && setUser(u))
      .catch((e) => console.error("user init failed", e));
    return () => {
      active = false;
    };
  }, [nickname]);
  return user;
}

/**
 * Live ranked pool for an event.
 * Primary channel: Socket.IO push (instant). Safety net: a slow poll in case a
 * socket event is missed. The server's broadcast omits per-viewer has_voted, so
 * we carry the viewer's own vote state forward across pushes.
 */
export function usePool(
  eventId: string | undefined,
  userId?: string,
  pollMs = 8000
) {
  const [pool, setPool] = useState<PoolSong[]>([]);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(userId);
  userRef.current = userId;
  const socketRef = useRef<Socket | null>(null);

  // merge incoming rows, preserving has_voted we already know locally
  const apply = useCallback((rows: PoolSong[], authoritativeVotes: boolean) => {
    setPool((prev) => {
      if (authoritativeVotes) return rows;
      const votedById = new Map(prev.map((r) => [r.id, r.has_voted]));
      return rows.map((r) => ({ ...r, has_voted: votedById.get(r.id) ?? false }));
    });
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      apply(await getPool(eventId, userRef.current), true);
    } catch (e) {
      console.error("pool fetch failed", e);
    }
  }, [eventId, apply]);

  useEffect(() => {
    if (!eventId) return;
    // initial authoritative fetch (knows our has_voted)
    refresh();

    const socket = io(API, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("join", eventId));
    socket.on("pool", (rows: PoolSong[]) => apply(rows, false));

    const poll = setInterval(refresh, pollMs);
    return () => {
      clearInterval(poll);
      socket.emit("leave", eventId);
      socket.disconnect();
    };
  }, [eventId, refresh, apply, pollMs]);

  return { pool, loading, refresh };
}
