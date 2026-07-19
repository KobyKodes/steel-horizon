// Per-viewer snapshot construction — the anti-cheat choke point (Phase 2
// DISCOVERY §3). buildSnapshot is the ONLY code path that serializes board
// state for the wire; no other module may touch a fleet or shot list when
// talking to a client. Redaction rules:
//
//   - `you.fleet` is the viewer's own placement (null until placed).
//   - `yourShots` are the viewer's ShotRecords; `shotsAgainstYou` are the
//     opponent's.
//   - `opponent.sunkShips` is derived from the viewer's own sunk results —
//     the viewer only learns what their hits have proven.
//   - `revealedOpponentFleet` carries the opponent's FleetPlacement ONLY
//     once the game is over; before that it is always null.
//   - `currentTurn` / `winner` are mapped to viewer-relative "you"/"opponent".

import {
  CALLED_SHOT_LIMIT,
  type RoomSnapshot,
  type ShipClassId,
  type ShotRecord,
} from "@steel-horizon/shared";
import type { Room } from "./rooms.js";

/** Ships the viewer has proven sunk via their own shot results. */
function sunkShipsFrom(shots: ShotRecord[]): ShipClassId[] {
  return shots.flatMap((shot) =>
    shot.result === "sunk" && shot.sunkShip !== undefined ? [shot.sunkShip] : [],
  );
}

/**
 * Build the redacted room state for one viewer, covering every phase from
 * lobby (no game yet) through gameover (opponent fleet revealed). Returns
 * null when the viewer is not seated in the room.
 */
export function buildSnapshot(
  room: Room,
  viewerSessionId: string,
): RoomSnapshot | null {
  const you = room.players.find((p) => p.sessionId === viewerSessionId);
  if (you === undefined) return null;
  const opponent = room.players.find((p) => p.sessionId !== viewerSessionId);

  const game = room.game;
  const yourState = game?.players[viewerSessionId];
  const opponentState =
    opponent === undefined ? undefined : game?.players[opponent.sessionId];

  const yourShots = yourState?.shots ?? [];
  const shotsAgainstYou = opponentState?.shots ?? [];
  const gameOver = game?.phase === "gameover";

  return {
    code: room.code,
    phase: room.phase,
    you: {
      name: you.name,
      ready: you.ready,
      connected: you.connected,
      fleet: yourState?.fleet ?? null,
    },
    opponent:
      opponent === undefined
        ? null
        : {
            name: opponent.name,
            ready: opponent.ready,
            connected: opponent.connected,
            sunkShips: sunkShipsFrom(yourShots),
          },
    yourShots,
    shotsAgainstYou,
    currentTurn:
      game?.currentPlayer == null
        ? null
        : game.currentPlayer === viewerSessionId
          ? "you"
          : "opponent",
    winner:
      game?.winner == null
        ? null
        : game.winner === viewerSessionId
          ? "you"
          : "opponent",
    winReason: game?.winReason ?? null,
    revealedOpponentFleet:
      gameOver && opponentState !== undefined ? opponentState.fleet : null,
    scores:
      yourState !== undefined && opponentState !== undefined
        ? { you: yourState.score, opponent: opponentState.score }
        : null,
    calledShotsRemaining: Math.max(
      0,
      CALLED_SHOT_LIMIT - (yourState?.calledShotsUsed ?? 0),
    ),
    finalScores:
      gameOver &&
      opponent !== undefined &&
      game?.finalScores?.[viewerSessionId] !== undefined &&
      game.finalScores[opponent.sessionId] !== undefined
        ? {
            you: game.finalScores[viewerSessionId]!,
            opponent: game.finalScores[opponent.sessionId]!,
          }
        : null,
    leaderboard: gameOver ? room.leaderboard : null,
    yourLeaderboardRank: gameOver
      ? (room.leaderboardRanks[viewerSessionId]?.allTimeRank ?? null)
      : null,
    weeklyLeaderboard: gameOver ? room.weeklyLeaderboard : null,
    yourWeeklyRank: gameOver
      ? (room.leaderboardRanks[viewerSessionId]?.weeklyRank ?? null)
      : null,
    winStreak: {
      you: room.winStreaks[viewerSessionId] ?? 0,
      opponent:
        opponent === undefined ? 0 : (room.winStreaks[opponent.sessionId] ?? 0),
    },
    rematch: {
      youRequested: game?.rematchRequests.has(viewerSessionId) ?? false,
      opponentRequested:
        opponent !== undefined &&
        (game?.rematchRequests.has(opponent.sessionId) ?? false),
    },
  };
}
