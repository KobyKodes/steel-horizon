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
import {
  placementFromCells,
  type Coordinate,
  type FleetPlacement,
  type ShipClassId,
  type ShipPlacement,
  type ShotRecord,
} from "@steel-horizon/shared";
import { SceneRoot } from "./SceneRoot";
import { FleetShips, placementCenterWorld } from "./ships/FleetShips";
import { HoloGrid, type CellState, GRID_ALTITUDE } from "./grid/HoloGrid";
import { cellToWorld } from "./grid/gridCoords";
import { gerstnerHeight } from "./waves";
import type { CameraView, ViewConfig } from "./camera/CameraRig";
import { triggerCameraShake } from "./camera/CameraRig";
import {
  ShellProjectile,
  easeInOutQuad,
  parabolicPosition,
} from "./effects/ShellProjectile";
import { ParticleBurst, type BurstPreset } from "./effects/ParticleBurst";
import { ResultCallout } from "./effects/ResultCallout";
import { ScorePopup } from "./effects/ScorePopup";
import { ChainShout, type ChainShoutTier } from "./effects/ChainShout";
import { chainHeat } from "../components/ScoreHud";
import {
  calledShotBust,
  scoreTick,
  sinkSlam,
  tierUp,
} from "../audio/arcadeSfx";

/** Heat tier ordering for detecting upward crossings. */
const HEAT_ORDER = { cold: 0, warm: 1, hot: 2, critical: 3 } as const;

/**
 * The single source of truth mapping a shot outcome to its impact VFX.
 * A hit OR a sunk always plays the gritty warm "explosion" burst with the
 * bigger shake; only a miss plays the pale "splash" with the smaller shake.
 * Used identically by the shooter's outgoing cinematic and the defender's
 * incoming cinematic, so the two browsers can never diverge on preset.
 */
function presetFor(result: ShotRecord["result"]): BurstPreset {
  return result === "miss" ? "splash" : "explosion";
}
function shakeFor(result: ShotRecord["result"]): number {
  return result === "miss" ? SHAKE_INTENSITY.miss : SHAKE_INTENSITY.hit;
}

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

// A cinematic can be driven by one of two shot streams:
//  - "outgoing": a shot YOU fired, animating on the enemy-waters targeting
//    grid (the shooter's experience).
//  - "incoming": a shot fired AT you, animating on your own fleet grid (the
//    defender's experience, 05-03 checkpoint expansion). The main view is
//    forced to "fleet" for its duration so the defender watches the shell
//    arc into their own fleet and see exactly where it struck.
// Both reuse the identical ShellProjectile/ParticleBurst/CameraRig
// primitives and the shared presetFor/shakeFor mapping — never duplicated.
type PendingKind = "outgoing" | "incoming";
interface PendingShot {
  kind: PendingKind;
  shot: ShotRecord;
}

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
  /**
   * Shots fired AT you (`shotsAgainstYou`). Interactive main-panel only.
   * When a NEW one arrives after mount, the main view flips to your own
   * fleet grid and plays the incoming-shot cinematic at the struck cell
   * (05-03 defender-side expansion). Omit for reveal instances / any board
   * that should never run an incoming cinematic.
   */
  incomingShots?: ShotRecord[];
  /**
   * Fired whenever an incoming-shot cinematic starts (true) or ends
   * (false), so the parent can relabel the panel ("Incoming fire!") while
   * the view is force-flipped to the fleet grid. View-flipping itself stays
   * internal to this adapter; the parent only needs the flag for its label.
   */
  onIncomingActiveChange?: (active: boolean) => void;
  /** Whether firing is currently allowed (your turn). Ignored in "reveal" mode. */
  canFire?: boolean;
  /** Ignored in "reveal" mode. */
  onFire?: (target: Coordinate) => void;
  /**
   * Fired once per OUTGOING shot at the moment its result lands on screen
   * (shell impact, or skip). Lets the parent advance HUD state — score
   * odometer, combo meter — in sync with what the player has actually seen
   * rather than with the (earlier) snapshot arrival.
   */
  onOutgoingResult?: (shot: ShotRecord) => void;
  /** Ships in `yourFleet` to play the sinking sequence for (SinkingShip.tsx). */
  sunkShips?: ShipClassId[];
}

export function GameSceneAdapter({
  view,
  mode = "interactive",
  yourFleet,
  shots,
  incomingShots,
  onIncomingActiveChange,
  canFire,
  onFire,
  onOutgoingResult,
  sunkShips,
}: GameSceneAdapterProps) {
  const isReveal = mode === "reveal";

  // Firing-sequence state — interactive mode only. Reveal mode always
  // shows every shot immediately (it's a read-only display of historical
  // and/or live-but-already-resolved shots against a board you're not
  // actively firing on; it never owns a "pending" shot). Two independent
  // settled counters gate the two append-only streams: `settledOutgoing`
  // for `shots` (shown on the enemy-waters targeting grid) and
  // `settledIncoming` for `incomingShots` (shown on your own fleet grid).
  // Both initialize to their prop length at mount so shots already present
  // (initial load, reconnect) never animate — only shots arriving AFTER
  // mount do. This holds symmetrically for the defender's incoming stream.
  const [settledOutgoing, setSettledOutgoing] = useState(shots.length);
  const [settledIncoming, setSettledIncoming] = useState(
    incomingShots?.length ?? 0,
  );
  const [pending, setPending] = useState<PendingShot | null>(null);
  const [sequenceStage, setSequenceStage] = useState<SequenceStage>(null);
  const [impactPosition, setImpactPosition] = useState<
    [number, number, number] | null
  >(null);
  const [shellFocus, setShellFocus] = useState<ViewConfig | null>(null);

  // Comic-book result word ("HIT!"/"SUNK!"/"MISS!") shown once per shot, at
  // the moment the outcome lands on screen: normally at shell impact, or at
  // skip if the player skips while the shell is still in flight (the result
  // reveal IS the skip's payoff). Keyed so back-to-back identical results
  // still remount and replay the pop animation.
  const [callout, setCallout] = useState<{
    result: ShotRecord["result"];
    key: number;
  } | null>(null);

  function showCallout(result: ShotRecord["result"]) {
    setCallout({ result, key: performance.now() });
  }

  // Arcade score popup — shown with the callout, but only for OUTGOING
  // shots (these are YOUR points) and only when the shot actually paid
  // (or cost — a busted called shot pops its penalty).
  const [scorePopup, setScorePopup] = useState<{
    score: NonNullable<ShotRecord["score"]>;
    key: number;
  } | null>(null);

  // Announcer shout when the chain crosses a heat tier upward.
  const [chainShout, setChainShout] = useState<{
    tier: ChainShoutTier;
    key: number;
  } | null>(null);
  const lastOutgoingMultRef = useRef(1);

  /** The single "outcome landed on screen" beat for an outgoing shot. */
  function revealOutgoingScore(shot: ShotRecord) {
    const event = shot.score;
    if (event) {
      if (event.points !== 0) {
        setScorePopup({ score: event, key: performance.now() });
      }
      // SFX: rising tick for points, slam for sinks, womp for a bust.
      if (event.points > 0) scoreTick(event.multiplier);
      if (event.points < 0) calledShotBust();
      if (event.bonuses.some((award) => award.bonus === "sink")) sinkSlam();
      // Tier crossing → announcer banner + riser.
      const previous = HEAT_ORDER[chainHeat(lastOutgoingMultRef.current)];
      const current = HEAT_ORDER[chainHeat(event.multiplier)];
      if (current > previous) {
        const tier = chainHeat(event.multiplier) as ChainShoutTier;
        setChainShout({ tier, key: performance.now() });
        tierUp(current);
      }
      lastOutgoingMultRef.current = event.multiplier;
    }
    onOutgoingResult?.(shot);
  }

  // Newly-sunk-ship debris burst (05-04). `sunkShipsSeenRef` is seeded with
  // whatever `sunkShips` looked like at mount, mirroring 05-03's "only
  // animate NEW events, not historical state" rule: a reload showing a
  // fleet that's already lost a ship must not replay its debris burst.
  // Only a ship class present in `sunkShips` that WASN'T seen before spawns
  // a burst. This is independent of — and layered alongside — the ship's
  // own sinking animation, which self-triggers off the same `sunk` prop
  // inside FleetShips/SinkingShip.tsx.
  const sunkShipsSeenRef = useRef<Set<ShipClassId>>(new Set(sunkShips ?? []));
  const [debrisBursts, setDebrisBursts] = useState<
    { key: string; origin: [number, number, number] }[]
  >([]);

  // Frozen forever at mount (contrast with `sunkShipsSeenRef` above, which
  // DOES mutate to dedupe bursts) — the definitive "was this already sunk
  // before this adapter ever existed" answer for the player's OWN fleet,
  // fed to FleetShips' `historicalSunkShips` so a reconnect never replays
  // the sinking animation. Every existing FloatingShip mounts at battle
  // start, well before any sinking, so this coincides with (and replaces)
  // the old locally-inferred "sunk on my own first render" heuristic.
  const historicalSunkShipsRef = useRef<Set<ShipClassId>>(
    new Set(sunkShips ?? []),
  );

  useEffect(() => {
    const seen = sunkShipsSeenRef.current;
    const current = sunkShips ?? [];
    const newlySunk = current.filter((shipClass) => !seen.has(shipClass));
    sunkShipsSeenRef.current = new Set(current);

    if (newlySunk.length === 0 || !yourFleet) return;

    const newBursts = newlySunk.flatMap((shipClass) => {
      // Compute the burst's world position via the SAME cellToWorld +
      // placement-center logic FleetShips.tsx uses to position the ship
      // itself, so the debris spawns exactly where the hull is.
      const placement = yourFleet.find((p) => p.ship === shipClass);
      if (!placement) return [];
      const [x, z] = placementCenterWorld(placement);
      const origin: [number, number, number] = [
        x,
        gerstnerHeight(x, z, performance.now() / 1000),
        z,
      ];
      return [{ key: `${shipClass}-${performance.now()}-${Math.random()}`, origin }];
    });

    if (newBursts.length > 0) {
      setDebrisBursts((bursts) => [...bursts, ...newBursts]);
    }
  }, [sunkShips, yourFleet]);

  // ENEMY ships sunk by YOUR outgoing shots (05-04, checkpoint fix). Before
  // a ship is sunk, fog of war means we have no idea where it is — there's
  // nothing to render. The instant a shot's `sunkShip`/`sunkShipCells` are
  // populated, that ship's shape is permanently public (03-03 decision:
  // safe to reveal in full), so its ShipPlacement can be reconstructed
  // client-side with zero protocol changes via the shared
  // `placementFromCells` (the exact inverse of `cellsForPlacement`).
  //
  // `mountShotsCountRef` is frozen at mount — any sinking shot already
  // present in `shots` at that point is historical (reconnect/refresh,
  // never replayed); only a sinking shot appended to `shots` AFTER mount
  // is live and plays the sinking animation, exactly mirroring the
  // yourFleet historical rule above. Recomputed from `shots` every render
  // (cheap: at most 17 sinkable ships).
  const mountShotsCountRef = useRef(shots.length);
  const enemySunkPlacements: ShipPlacement[] = [];
  const enemyHistoricalSunk: ShipClassId[] = [];
  shots.forEach((shot, i) => {
    if (shot.sunkShip && shot.sunkShipCells) {
      enemySunkPlacements.push(
        placementFromCells(shot.sunkShip, shot.sunkShipCells),
      );
      if (i < mountShotsCountRef.current) {
        enemyHistoricalSunk.push(shot.sunkShip);
      }
    }
  });

  // Debris burst for newly-sunk ENEMY ships, mirroring the yourFleet burst
  // effect above exactly (same dedupe-via-seen-set shape), keyed off ship
  // class rather than a `sunkShips` prop since there isn't one for the
  // enemy side — `enemySunkPlacements` IS the source of truth here.
  const enemySunkSeenRef = useRef<Set<ShipClassId>>(
    new Set(enemyHistoricalSunk),
  );
  const [enemyDebrisBursts, setEnemyDebrisBursts] = useState<
    { key: string; origin: [number, number, number] }[]
  >([]);

  useEffect(() => {
    const seen = enemySunkSeenRef.current;
    const newlySunk = enemySunkPlacements.filter((p) => !seen.has(p.ship));
    enemySunkSeenRef.current = new Set(enemySunkPlacements.map((p) => p.ship));

    if (newlySunk.length === 0) return;

    const newBursts = newlySunk.map((placement) => {
      const [x, z] = placementCenterWorld(placement);
      const origin: [number, number, number] = [
        x,
        gerstnerHeight(x, z, performance.now() / 1000),
        z,
      ];
      return {
        key: `${placement.ship}-${performance.now()}-${Math.random()}`,
        origin,
      };
    });
    setEnemyDebrisBursts((bursts) => [...bursts, ...newBursts]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots]);

  // Only one cinematic runs at a time. Outgoing (your own shot) is preferred
  // when both are newly available — turns alternate so this is rare, but if
  // the opponent fires back while your outgoing shot is still animating, the
  // incoming shot simply queues and starts the instant this effect re-runs
  // after settle.
  useEffect(() => {
    if (isReveal || pending) return;
    if (shots.length > settledOutgoing) {
      const next = shots[settledOutgoing];
      if (next) {
        setPending({ kind: "outgoing", shot: next });
        setSequenceStage("flight");
        return;
      }
    }
    if (incomingShots && incomingShots.length > settledIncoming) {
      const next = incomingShots[settledIncoming];
      if (next) {
        setPending({ kind: "incoming", shot: next });
        setSequenceStage("flight");
      }
    }
  }, [
    isReveal,
    pending,
    shots,
    settledOutgoing,
    incomingShots,
    settledIncoming,
  ]);

  const incomingActive = pending?.kind === "incoming";

  // Let the parent relabel its panel while the view is force-flipped to the
  // fleet grid for an incoming cinematic. Fires on true->false too, so the
  // label returns to normal exactly when the cinematic ends.
  useEffect(() => {
    if (isReveal) return;
    onIncomingActiveChange?.(incomingActive);
  }, [isReveal, incomingActive, onIncomingActiveChange]);

  function settleSequence() {
    // Skipped mid-flight: the impact never fired, so the callout hasn't
    // shown yet — pop it now alongside the instantly-revealed marker.
    if (pending && sequenceStage === "flight") {
      showCallout(pending.shot.result);
      if (pending.kind === "outgoing") revealOutgoingScore(pending.shot);
    }
    if (pending?.kind === "incoming") {
      setSettledIncoming((count) => count + 1);
    } else {
      setSettledOutgoing((count) => count + 1);
    }
    setPending(null);
    setSequenceStage(null);
    setImpactPosition(null);
    setShellFocus(null);
  }

  function handleImpact(pos: [number, number, number]) {
    if (!pending) return;
    setImpactPosition(pos);
    setShellFocus({
      position: [
        pos[0] + CAMERA_FOLLOW_OFFSET[0],
        pos[1] + CAMERA_FOLLOW_OFFSET[1],
        pos[2] + CAMERA_FOLLOW_OFFSET[0],
      ],
      lookAt: pos,
    });
    triggerCameraShake(shakeFor(pending.shot.result));
    showCallout(pending.shot.result);
    if (pending.kind === "outgoing") revealOutgoingScore(pending.shot);
    setSequenceStage("impact");
  }

  // Skip: Escape/Space immediately resolves the pending shot. Scoped to
  // interactive mode with an active sequence only (reveal mode never has
  // one). Click/tap-anywhere-on-the-scene skip is wired via the wrapping
  // div's onPointerDown below rather than a second listener here.
  useEffect(() => {
    if (isReveal || !pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === " ") {
        event.preventDefault();
        settleSequence();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReveal, pending]);

  // During an incoming cinematic the main view is forced to the fleet grid
  // so the defender watches the shell arc into their own fleet; otherwise
  // it honors the caller's chosen `view`. Reverts automatically the instant
  // the cinematic settles (pending -> null), returning the defender to
  // their normal flow with no BattleScreen state change required.
  const effectiveView: CameraView = incomingActive ? "fleet" : view;

  // Which shot stream feeds the grid markers depends on which board the
  // camera is framing. Fleet framing shows the shots fired AT you on your
  // own fleet; targeting framing shows the shots you fired on enemy waters.
  // Each is gated by its own settled counter so the actively-animating shot
  // stays hidden until its cinematic completes.
  let cellStates: Map<string, CellState>;
  if (isReveal) {
    cellStates = cellStatesFrom(shots);
  } else if (effectiveView === "fleet") {
    cellStates = cellStatesFrom((incomingShots ?? []).slice(0, settledIncoming));
  } else {
    cellStates = cellStatesFrom(shots.slice(0, settledOutgoing));
  }

  const shellTarget: [number, number, number] | null = pending
    ? (() => {
        const [x, z] = cellToWorld(pending.shot.target);
        return [x, GRID_ALTITUDE, z];
      })()
    : null;

  return (
    <div
      className="game-scene"
      onPointerDown={() => {
        // Click/tap anywhere on the scene skips an active sequence.
        if (!isReveal && pending) settleSequence();
      }}
    >
      <SceneRoot view={effectiveView} shellFocus={shellFocus}>
        {/* In interactive mode, ships only render in fleet view — the grid
            is shared physical space for both views (04-05 established one
            cellToWorld mapping for everything), but it stands for two
            different boards (your own fleet vs. the enemy's waters), so
            your ships must not appear while the grid is being read as the
            enemy's board. In reveal mode there's only ever one board being
            shown (this fleet + its shot history), so the ships always render. */}
        {(isReveal || effectiveView === "fleet") && yourFleet && (
          <FleetShips
            placements={yourFleet}
            sunkShips={sunkShips}
            historicalSunkShips={[...historicalSunkShipsRef.current]}
          />
        )}
        {(isReveal || effectiveView === "fleet") &&
          debrisBursts.map((burst) => (
            <ParticleBurst
              key={burst.key}
              preset="debris"
              origin={burst.origin}
              onComplete={() =>
                setDebrisBursts((bursts) =>
                  bursts.filter((b) => b.key !== burst.key),
                )
              }
            />
          ))}
        {/* Reconstructed ENEMY hulls — only the ones sunk by your own
            outgoing shots, only while framing enemy waters (fog of war: an
            unsunk enemy ship's position is never known, so it can never
            render here). Reveal-mode instances that need real opponent
            geometry already receive it via `yourFleet` directly (see
            PostGameScreen) and never take this path. */}
        {!isReveal &&
          effectiveView === "targeting" &&
          enemySunkPlacements.length > 0 && (
            <FleetShips
              placements={enemySunkPlacements}
              sunkShips={enemySunkPlacements.map((p) => p.ship)}
              historicalSunkShips={enemyHistoricalSunk}
            />
          )}
        {!isReveal &&
          effectiveView === "targeting" &&
          enemyDebrisBursts.map((burst) => (
            <ParticleBurst
              key={burst.key}
              preset="debris"
              origin={burst.origin}
              onComplete={() =>
                setEnemyDebrisBursts((bursts) =>
                  bursts.filter((b) => b.key !== burst.key),
                )
              }
            />
          ))}
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
                  // Never fire while framing your own fleet (manual toggle
                  // or an incoming cinematic) — you only shoot enemy waters.
                  if (effectiveView !== "targeting") return;
                  if (!canFire) return;
                  if (pending) return;
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
        {sequenceStage === "impact" && impactPosition && pending && (
          <ParticleBurst
            preset={presetFor(pending.shot.result)}
            origin={impactPosition}
            onComplete={settleSequence}
          />
        )}
      </SceneRoot>
      {callout && (
        <ResultCallout
          key={callout.key}
          result={callout.result}
          onDone={() => setCallout(null)}
        />
      )}
      {scorePopup && (
        <ScorePopup
          // Prefixed: at impact this and the callout are minted in the same
          // tick, and identical numeric keys on siblings collide.
          key={`score-${scorePopup.key}`}
          score={scorePopup.score}
          onDone={() => setScorePopup(null)}
        />
      )}
      {chainShout && (
        <ChainShout
          key={`shout-${chainShout.key}`}
          tier={chainShout.tier}
          onDone={() => setChainShout(null)}
        />
      )}
    </div>
  );
}
