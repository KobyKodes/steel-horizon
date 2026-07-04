// Snapshot-driven Zustand store — the single client-side source of truth.
//
// The store holds the latest RoomSnapshot verbatim; every screen renders
// purely from it. Socket listeners are registered ONCE at module init (not
// in React effects — StrictMode double-mount would duplicate them).

import { create } from "zustand";
import type {
  Coordinate,
  ErrorCode,
  RoomSnapshot,
  ShipClassId,
  ShotOutcome,
} from "@steel-horizon/shared";
import { connect, getStoredName, socket, storeSessionId } from "./socket";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected";

export interface ShotFeedEntry {
  shooter: string;
  target: Coordinate;
  result: ShotOutcome;
  sunkShip?: ShipClassId;
}

interface GameStore {
  snapshot: RoomSnapshot | null;
  connection: ConnectionState;
  lastError: { code: ErrorCode; message: string } | null;
  shotFeed: ShotFeedEntry[];

  clearError: () => void;
  createRoom: (name: string) => void;
  joinRoom: (name: string, code: string) => void;
  quickMatch: (name: string) => void;
  setReady: (ready: boolean) => void;
}

/** Connect first (persisting the name) so the emit rides the new socket. */
function connectAndEmit(name: string, emit: () => void): void {
  if (!socket.connected) {
    useGameStore.setState({ connection: "connecting" });
  }
  connect(name);
  emit();
}

export const useGameStore = create<GameStore>((set) => ({
  snapshot: null,
  connection: "idle",
  lastError: null,
  shotFeed: [],

  clearError: () => set({ lastError: null }),

  createRoom: (name) =>
    connectAndEmit(name, () => socket.emit("createRoom", { name })),

  joinRoom: (name, code) =>
    connectAndEmit(name, () => socket.emit("joinRoom", { name, code })),

  quickMatch: (name) =>
    connectAndEmit(name, () => socket.emit("quickMatch", { name })),

  setReady: (ready) => socket.emit("setReady", { ready }),
}));

// --- Socket listeners: registered exactly once at module init ---

socket.on("connect", () => {
  useGameStore.setState({ connection: "connected" });
});

socket.on("disconnect", () => {
  useGameStore.setState({ connection: "disconnected" });
});

socket.io.on("reconnect_attempt", () => {
  useGameStore.setState({ connection: "connecting" });
});

socket.on("session", ({ sessionId }) => {
  storeSessionId(sessionId);
});

socket.on("roomState", ({ snapshot }) => {
  const previous = useGameStore.getState().snapshot;
  // Fresh game or rematch reset: wipe the shot feed when we enter placement.
  const enteredPlacement =
    snapshot.phase === "placement" && previous?.phase !== "placement";
  useGameStore.setState({
    snapshot,
    ...(enteredPlacement ? { shotFeed: [] } : {}),
  });
});

socket.on("shotResult", (entry) => {
  useGameStore.setState((state) => ({ shotFeed: [...state.shotFeed, entry] }));
});

socket.on("errorEvent", (payload) => {
  useGameStore.setState({ lastError: payload });
});

// Refresh resume: if this tab already has an identity, reconnect immediately —
// the server's session-resume snapshot restores the correct screen without
// any user action. (Auth callback pulls sessionId/name from sessionStorage.)
if (getStoredName()) {
  useGameStore.setState({ connection: "connecting" });
  socket.connect();
}
