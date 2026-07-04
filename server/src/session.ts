// App-level sessions. Player identity is a server-minted sessionId carried
// in the Socket.IO handshake auth — never socket.id, which regenerates on
// every reconnect. Store is a Map behind a narrow interface so a Redis
// implementation is a mechanical swap later.

export interface SessionData {
  name: string;
  roomCode: string | null;
}

export interface SessionStore {
  get(sessionId: string): SessionData | undefined;
  set(sessionId: string, data: SessionData): void;
  delete(sessionId: string): void;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionData>();

  get(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  set(sessionId: string, data: SessionData): void {
    this.sessions.set(sessionId, data);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
