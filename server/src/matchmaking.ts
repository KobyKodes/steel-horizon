// Quick-match FIFO queue. Pure module (no socket.io import): the socket
// layer enqueues sessions and turns returned pairings into rooms.

export interface QueueEntry {
  sessionId: string;
  name: string;
}

export type EnqueueResult =
  | { status: "waiting" }
  | { status: "paired"; players: [QueueEntry, QueueEntry] }
  | { status: "rejected"; reason: "already-queued" | "already-in-room" };

export class MatchmakingQueue {
  private readonly waiting: QueueEntry[] = [];

  /**
   * Add a session to the queue. Rejects a session that is already queued or
   * already in a room (room membership is injected as a predicate). When two
   * distinct sessions are waiting, both are dequeued and returned as a
   * pairing for the caller to create a room from.
   */
  enqueue(
    entry: QueueEntry,
    isInRoom: (sessionId: string) => boolean,
  ): EnqueueResult {
    if (this.has(entry.sessionId)) {
      return { status: "rejected", reason: "already-queued" };
    }
    if (isInRoom(entry.sessionId)) {
      return { status: "rejected", reason: "already-in-room" };
    }

    this.waiting.push(entry);

    if (this.waiting.length >= 2) {
      const first = this.waiting.shift();
      const second = this.waiting.shift();
      if (first === undefined || second === undefined) {
        throw new Error("unreachable: queue drained during pairing");
      }
      return { status: "paired", players: [first, second] };
    }

    return { status: "waiting" };
  }

  /** Remove a session from the queue (e.g. on disconnect). No-op if absent. */
  remove(sessionId: string): void {
    const index = this.waiting.findIndex((e) => e.sessionId === sessionId);
    if (index !== -1) this.waiting.splice(index, 1);
  }

  has(sessionId: string): boolean {
    return this.waiting.some((e) => e.sessionId === sessionId);
  }

  get size(): number {
    return this.waiting.length;
  }
}
