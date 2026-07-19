// Typed socket singleton with session-resume handshake auth.
//
// sessionId is a resume credential (02-01 decision): kept in sessionStorage
// so each browser tab is its own player while a refresh within a tab resumes
// the same session. Never display or log it.
//
// Auth uses the callback form — socket.io re-evaluates callback auth on every
// reconnect attempt, so a sessionId minted mid-session is picked up on the
// next reconnect without reconstructing the socket.

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@steel-horizon/shared";

const SESSION_ID_KEY = "sessionId";
const NAME_KEY = "name";

export function getStoredName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? "";
}

export function storeSessionId(sessionId: string): void {
  sessionStorage.setItem(SESSION_ID_KEY, sessionId);
}

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: false,
  auth: (cb) => {
    cb({
      sessionId: sessionStorage.getItem(SESSION_ID_KEY) ?? undefined,
      name: sessionStorage.getItem(NAME_KEY) ?? undefined,
      // Account bearer token (localStorage — survives new tabs/restarts),
      // so the server attributes this connection's games to the account.
      authToken: localStorage.getItem("authToken") ?? undefined,
    });
  },
});

/** Store the name and connect (no-op if already connected). */
export function connect(name: string): void {
  sessionStorage.setItem(NAME_KEY, name);
  if (!socket.connected) {
    socket.connect();
  }
}
