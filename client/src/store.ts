// Snapshot-driven Zustand store — the single client-side source of truth.
//
// The store holds the latest RoomSnapshot verbatim; every screen renders
// purely from it. Socket listeners are registered ONCE at module init (not
// in React effects — StrictMode double-mount would duplicate them).

import { create } from "zustand";
import type {
  BotDifficulty,
  Coordinate,
  ErrorCode,
  FleetPlacement,
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
  playBot: (name: string, difficulty: BotDifficulty) => void;
  setReady: (ready: boolean) => void;
  placeFleet: (fleet: FleetPlacement) => void;
  fire: (target: Coordinate, calledShot?: boolean) => void;
  requestRematch: () => void;
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

  playBot: (name, difficulty) =>
    connectAndEmit(name, () =>
      socket.emit("createBotGame", { name, difficulty }),
    ),

  setReady: (ready) => socket.emit("setReady", { ready }),

  placeFleet: (fleet) => socket.emit("placeFleet", { fleet }),

  fire: (target, calledShot = false) =>
    socket.emit("fire", { target, calledShot }),

  requestRematch: () => socket.emit("requestRematch"),
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

// Dev-only E2E hook: Playwright cannot click the R3F canvas, so tests
// drive the real store directly. A dynamic import('/src/store.ts') from
// page.evaluate can land on a second module instance (Vite versions module
// URLs), so the app's own instance is published here.
declare global {
  interface Window {
    __gameStore?: typeof useGameStore;
  }
}
if (import.meta.env.DEV) {
  window.__gameStore = useGameStore;
}

// Refresh resume: if this tab already has an identity, reconnect immediately —
// the server's session-resume snapshot restores the correct screen without
// any user action. (Auth callback pulls sessionId/name from sessionStorage.)
if (getStoredName()) {
  useGameStore.setState({ connection: "connecting" });
  socket.connect();
}
