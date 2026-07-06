// GameSceneAdapter — the game-facing API over the raw 3D scene pieces
// (SceneRoot/CameraRig, FleetShips, HoloGrid). This is the only place real
// RoomSnapshot-shaped data (fleet placements, shot history, turn gating)
// touches the scene; HoloGrid and FleetShips themselves stay
// game-state-agnostic. 04-07 (placement) builds its own thin adapter over
// the same underlying pieces rather than teaching HoloGrid/FleetShips new
// game rules directly.
//
// Two modes: "interactive" (04-05's Battle screen — fleet/targeting view
// toggle, live firing) and "reveal" (04-06's Post-Game screen — a single
// read-only display of one fleet plus its shot history, no firing, no
// hover/click at all).

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type {
  Coordinate,
  FleetPlacement,
  ShipClassId,
  ShotRecord,
} from "@steel-horizon/shared";
import { SceneRoot } from "./SceneRoot";
import { FleetShips } from "./ships/FleetShips";
import { HoloGrid, type CellState, GRID_ALTITUDE } from "./grid/HoloGrid";
import { cellToWorld } from "./grid/gridCoords";
import type { CameraView, ViewConfig } from "./camera/CameraRig";
import { triggerCameraShake } from "./camera/CameraRig";
import {
  ShellProjectile,
  easeInOutQuad,
  parabolicPosition,
} from "./effects/ShellProjectile";
import { ParticleBurst } from "./effects/ParticleBurst";

/** `` `${col},${row}` `` — matches TargetingBoard.tsx's cellKey convention. */
function cellKey(coord: Coordinate): string {
  return `${coord.col},${coord.row}`;
}

/**
 * Cells belonging to sunk ships, from the server-supplied `sunkShipCells`.
 * Ported verbatim from TargetingBoard.tsx — do not re-derive.
 */
function sunkCellsFrom(shots: ShotRecord[]): Set<string> {
  const sunk = new Set<string>();
  for (const shot of shots) {
    for (const cell of shot.sunkShipCells ?? []) {
      sunk.add(cellKey(cell));
    }
  }
  return sunk;
}

/** Converts a shot history into HoloGrid's `cellStates` map. */
function cellStatesFrom(shots: ShotRecord[]): Map<string, CellState> {
  const sunkCells = sunkCellsFrom(shots);
  const states = new Map<string, CellState>();
  for (const shot of shots) {
    const key = cellKey(shot.target);
    if (shot.result === "miss") {
      states.set(key, "miss");
    } else {
      states.set(key, sunkCells.has(key) ? "sunk" : "hit");
    }
  }
  return states;
}

// Firing-sequence tuning (05-03). Total flight + impact-burst time must
// stay under ROADMAP.md's 2.5s cap: SHELL_FLIGHT_SECONDS (0.9s) + the
// longest ParticleBurst preset (explosion, 0.8s lifetime) is ~1.7s,
// comfortably inside budget with room for the shake's own independent
// decay (which doesn't block settling).
const SHELL_FLIGHT_SECONDS = 0.9;
const SHELL_ARC_HEIGHT = 5;

// Fixed launch point just outside the grid's near edge (the grid spans
// roughly x/z=[-19.7, 19.7] at GRID_ALTITUDE, per 04-07's CameraRig
// notes) — the firing ship's exact world position isn't tracked by this
// adapter, so every shot launches from this one point regardless of which
// ship fired it.
const LAUNCH_POINT: [number, number, number] = [0, GRID_ALTITUDE + 3, 24];

// Chase-cam offset applied on top of the shell's live position (flight)
// or the impact point (post-impact hold), so the camera watches from
// slightly above/behind rather than sitting exactly on top of the action.
const CAMERA_FOLLOW_OFFSET: [number, number] = [10, 12];

const SHAKE_INTENSITY: Record<"hit" | "miss", number> = {
  hit: 0.55,
  miss: 0.18,
};

type SequenceStage = "flight" | "impact" | null;

/**
 * Drives `shellFocus` every frame while the shell is in flight, reusing
 * ShellProjectile's exact eased/parabolic math (imported, not re-derived)
 * so the camera's chase target and the visible shell never diverge. Lives
 * inside the Canvas (as a SceneRoot child) purely for its useFrame loop —
 * it renders nothing.
 */
function ShellFocusTracker({
  start,
  end,
  durationSeconds,
  arcHeight,
  onUpdate,
}: {
  start: [number, number, number];
  end: [number, number, number];
  durationSeconds: number;
  arcHeight: number;
  onUpdate: (focus: ViewConfig) => void;
}) {
  const elapsedRef = useRef(0);

  useFrame((_state, delta) => {
    elapsedRef.current += delta;
    const t = Math.min(elapsedRef.current / durationSeconds, 1);
    const easedT = easeInOutQuad(t);
    const shellPos = parabolicPosition(start, end, easedT, arcHeight);
    onUpdate({
      position: [
        shellPos[0] + CAMERA_FOLLOW_OFFSET[0],
        shellPos[1] + CAMERA_FOLLOW_OFFSET[1],
        shellPos[2] + CAMERA_FOLLOW_OFFSET[0],
      ],
      lookAt: shellPos,
    });
  });

  return null;
}

export interface GameSceneAdapterProps {
  view: CameraView;
  /** Default "interactive" (Battle screen); "reveal" is a read-only display (Post-Game screen). */
  mode?: "interactive" | "reveal";
  /** Fleet placements to render; null before placement completes. */
  yourFleet: FleetPlacement | null;
  /** Shot history against this fleet's opponent, driving the grid's markers. */
  shots: ShotRecord[];
  /** Whether firing is currently allowed (your turn). Ignored in "reveal" mode. */
  canFire?: boolean;
  /** Ignored in "reveal" mode. */
  onFire?: (target: Coordinate) => void;
  /** Ships in `yourFleet` to render with the damaged material tint. */
  sunkShips?: ShipClassId[];
}

export function GameSceneAdapter({
  view,
  mode = "interactive",
  yourFleet,
  shots,
  canFire,
  onFire,
  sunkShips,
}: GameSceneAdapterProps) {
  const isReveal = mode === "reveal";

  // Firing-sequence state — interactive mode only. Reveal mode always
  // shows every shot immediately (it's a read-only display of historical
  // and/or live-but-already-resolved shots against a board you're not
  // actively firing on; it never owns a "pending" shot). `settledCount`
  // tracks how many entries of the append-only `shots` array are shown on
  // the grid; anything beyond it is either the one currently animating or
  // not yet detected. Initialized to `shots.length` so shots already
  // present at mount (initial load, reconnect) never animate — only shots
  // that arrive AFTER mount do.
  const [settledCount, setSettledCount] = useState(shots.length);
  const [pendingShot, setPendingShot] = useState<ShotRecord | null>(null);
  const [sequenceStage, setSequenceStage] = useState<SequenceStage>(null);
  const [impactPosition, setImpactPosition] = useState<
    [number, number, number] | null
  >(null);
  const [shellFocus, setShellFocus] = useState<ViewConfig | null>(null);

  useEffect(() => {
    if (isReveal) return;
    if (pendingShot) return;
    if (shots.length > settledCount) {
      const next = shots[settledCount];
      if (next) {
        setPendingShot(next);
        setSequenceStage("flight");
      }
    }
  }, [isReveal, pendingShot, shots, settledCount]);

  function settleSequence() {
    setSettledCount((count) => count + 1);
    setPendingShot(null);
    setSequenceStage(null);
    setImpactPosition(null);
    setShellFocus(null);
  }

  function handleImpact(pos: [number, number, number]) {
    if (!pendingShot) return;
    setImpactPosition(pos);
    setShellFocus({
      position: [
        pos[0] + CAMERA_FOLLOW_OFFSET[0],
        pos[1] + CAMERA_FOLLOW_OFFSET[1],
        pos[2] + CAMERA_FOLLOW_OFFSET[0],
      ],
      lookAt: pos,
    });
    const isHit = pendingShot.result !== "miss";
    triggerCameraShake(isHit ? SHAKE_INTENSITY.hit : SHAKE_INTENSITY.miss);
    setSequenceStage("impact");
  }

  // Skip: Escape/Space immediately resolves the pending shot. Scoped to
  // interactive mode with an active sequence only (reveal mode never has
  // one). Click/tap-anywhere-on-the-scene skip is wired via the wrapping
  // div's onPointerDown below rather than a second listener here.
  useEffect(() => {
    if (isReveal || !pendingShot) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === " ") {
        event.preventDefault();
        settleSequence();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReveal, pendingShot]);

  const settledShots = isReveal ? shots : shots.slice(0, settledCount);
  const cellStates = cellStatesFrom(settledShots);

  const shellTarget: [number, number, number] | null = pendingShot
    ? (() => {
        const [x, z] = cellToWorld(pendingShot.target);
        return [x, GRID_ALTITUDE, z];
      })()
    : null;

  return (
    <div
      className="game-scene"
      onPointerDown={() => {
        // Click/tap anywhere on the scene skips an active sequence.
        if (!isReveal && pendingShot) settleSequence();
      }}
    >
      <SceneRoot view={view} shellFocus={shellFocus}>
        {/* In interactive mode, ships only render in fleet view — the grid
            is shared physical space for both views (04-05 established one
            cellToWorld mapping for everything), but it stands for two
            different boards (your own fleet vs. the enemy's waters), so
            your ships must not appear while the grid is being read as the
            enemy's board. In reveal mode there's only ever one board being
            shown (this fleet + its shot history), so the ships always render. */}
        {(isReveal || view === "fleet") && yourFleet && (
          <FleetShips placements={yourFleet} sunkShips={sunkShips} />
        )}
        <HoloGrid
          cellStates={cellStates}
          interactive={!isReveal}
          onSelectCell={
            isReveal
              ? undefined
              : (target) => {
                  // Mirrors TargetingBoard's old `clickable` gate: only
                  // forward a fire attempt when it's your turn AND the cell
                  // has no existing shot record — HoloGrid already
                  // withholds callbacks for cells with a state, this
                  // additionally guards the (turn-gated) case where the
                  // cell is untargeted but it's not your turn. Also blocks
                  // while a firing sequence is actively playing, so a shot
                  // can't be double-fired at the still-unmarked target
                  // cell mid-cinematic.
                  if (!canFire) return;
                  if (pendingShot) return;
                  if (cellStates.has(cellKey(target))) return;
                  onFire?.(target);
                }
          }
        />
        {sequenceStage === "flight" && shellTarget && (
          <>
            <ShellProjectile
              start={LAUNCH_POINT}
              end={shellTarget}
              durationSeconds={SHELL_FLIGHT_SECONDS}
              arcHeight={SHELL_ARC_HEIGHT}
              onImpact={handleImpact}
            />
            <ShellFocusTracker
              start={LAUNCH_POINT}
              end={shellTarget}
              durationSeconds={SHELL_FLIGHT_SECONDS}
              arcHeight={SHELL_ARC_HEIGHT}
              onUpdate={setShellFocus}
            />
          </>
        )}
        {sequenceStage === "impact" && impactPosition && pendingShot && (
          <ParticleBurst
            preset={pendingShot.result === "miss" ? "splash" : "explosion"}
            origin={impactPosition}
            onComplete={settleSequence}
          />
        )}
      </SceneRoot>
    </div>
  );
}
