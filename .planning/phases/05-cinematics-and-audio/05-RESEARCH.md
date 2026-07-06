# Phase 5: Cinematics & Audio - Research

**Researched:** 2026-07-06
**Domain:** R3F/Three.js cinematic sequencing (camera choreography, particles, projectile trails) + self-contained Web Audio
**Confidence:** HIGH (stack findings verified directly against installed node_modules, not just docs) / MEDIUM (audio synthesis quality is a judgment call, not a verifiable fact)

<research_summary>
## Summary

No Context7 MCP tool was available in this environment, so findings come from WebSearch/WebFetch cross-checked directly against the versions actually installed in `node_modules` (three@0.185.1, @react-three/fiber@8.9.2, @react-three/drei@9.122.0, meshline — a drei dependency, already present) rather than trusting possibly-stale web docs. This matters because this phase's whole risk is version-specific API shape, not "which library."

Two drei primitives cover almost everything this phase needs without new dependencies: `Trail`/`useTrail` (shell smoke trail) and `CameraShake` (impact screen shake) are both already installed as part of drei 9.122.0. Particle bursts (splash/explosion/debris) are simple enough, and few enough distinct effects are needed (3-4), that hand-rolling with `THREE.Points`/`BufferGeometry` is the right call over adding a VFX library like `wawa-vfx` or `three.quarks` — those are built for far higher particle-effect variety/volume than one splash + one explosion + bubbles needs, and this project's decision log has consistently avoided adding animation/VFX dependencies (GSAP/Theatre.js were explicitly rejected in Phase 4 for the same reason: a damped `useFrame` loop was simpler and sufficient).

The one real landmine: **drei's `CameraShake` is incompatible with this project's existing `CameraRig` as-is.** `CameraShake` captures the camera's rotation once and then overwrites `camera.rotation` additively every frame from that stale snapshot — but `CameraRig` already calls `camera.lookAt()` every frame to continuously re-derive rotation from a damped look-at target. Mounting both means whichever component's `useFrame` runs last each frame wins, fighting the other and desyncing the camera from its intended framing the moment a shake starts. The shake math needs to be hand-rolled as a small offset applied inside `CameraRig`'s own `useFrame`, after `lookAt()`, not dropped in as a sibling component.

For audio, "self-contained" per the roadmap explicitly poses WebAudio-generated vs tiny embedded samples as the open choice. Raw `AudioContext` (oscillators + noise buffers + envelopes + a `GainNode` master/mute) is sufficient and dependency-free for short percussive/mechanical sounds (splash, sonar ping, UI clicks, klaxon beep) and matches this project's pattern of avoiding libraries where the platform API suffices. A convincing low-frequency explosion "boom" is the one place pure synthesis is genuinely hard to get right (needs sub-bass content and complex transient shaping); a few KB of embedded compressed sample audio for just the explosion (and maybe a musical sting) is a reasonable, still "self-contained" (no network fetch, bundled in the client) middle ground — this is a judgment call for planning, not a fully verified fact.

**Primary recommendation:** Hand-roll a small `CinematicsController`-style sequencer using `useFrame` state machines (matching the existing `CameraRig` damp pattern), reuse drei's `Trail`/`useTrail` for the shell's smoke trail, hand-roll one reusable `Points`-based particle burst component parameterized for splash/explosion/debris, extend `CameraRig` itself (not a separate `CameraShake` mount) with an additive shake offset, and build a minimal raw-WebAudio `AudioManager` with synthesized SFX plus 1-2 embedded compressed samples for the explosion boom.
</research_summary>

<standard_stack>
## Standard Stack

### Core (already installed — confirmed via node_modules, no new install needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | 0.185.1 | 3D rendering, `Points`/`BufferGeometry` for particles | Already the project's pinned renderer |
| @react-three/fiber | 8.9.2 | `useFrame` sequencing for all cinematics | Already the project's pinned R3F |
| @react-three/drei | 9.122.0 | `Trail`/`useTrail` for shell smoke trail | Already installed; `Trail.d.ts` confirmed present locally |
| meshline | (drei dependency, present) | Backs drei's `Trail` (MeshLine geometry) | Already resolved in node_modules as a transitive dep — no explicit install needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Audio API (`AudioContext`, `GainNode`, `OscillatorNode`, `AudioBufferSourceNode`) | native browser API | All SFX playback + synthesis + master mute | No library needed; native and dependency-free |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `Points` particle burst | `wawa-vfx` or `three.quarks` | Real VFX engines built for many concurrent varied emitters at scale; this phase needs ~3 effect types (splash, explosion, debris/bubbles) reused per-shot — a new dependency and its learning curve isn't justified for that scope |
| Hand-rolled shake offset inside `CameraRig` | drei's `CameraShake` component | Confirmed incompatible as a sibling mount (see pitfalls) — would need CameraRig to stop calling `lookAt()` every frame, which breaks the fleet/targeting view transitions Phase 4 already built |
| Raw WebAudio synthesis + tiny embedded samples | Howler.js | Howler is built for many concurrent tracks/asset management at scale; this phase has a handful of short one-shot SFX plus one ambient loop — raw `AudioContext` is sufficient and keeps zero new dependencies, consistent with this project's established pattern (GSAP/Theatre.js rejected in Phase 4 for the same reason) |

**Installation:**
No new packages required — `Trail`, `useTrail`, and particle/audio primitives all come from what's already in `package.json` plus native browser APIs.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Structure (extends existing `client/src/scene/`)
```
client/src/scene/
├── camera/
│   └── CameraRig.tsx        # extend: add shake offset + a "shellFollow" dynamic view
├── effects/                 # new
│   ├── ShellProjectile.tsx  # parabolic arc motion + Trail
│   ├── ParticleBurst.tsx    # reusable Points-based burst (splash/explosion/debris)
│   └── SinkingShip.tsx      # list/flood/slide-under override on top of FleetShips' wave bob
├── audio/                   # new
│   └── AudioManager.ts      # AudioContext singleton, synthesized SFX, mute persisted
```

### Pattern 1: Parabolic Shell Arc with Camera Follow
**What:** A shell is a single mesh whose position is computed each frame from elapsed time along a parabolic (ballistic) path between the firing ship's world position and the target cell's world position (reuse `cellToWorld` from `gridCoords.ts`, per the existing "one grid-to-world mapping" decision). The camera does not physically attach to the shell as a child (which would inherit its scale/it flying off-axis) — instead a dedicated camera state drives `CameraRig`'s `lookAt` (and optionally position) toward the shell's live position every frame, exactly like the existing fleet/targeting damp transitions, just re-targeted every frame instead of toward a fixed config.
**When to use:** The firing sequence's shell-follow beat.
**Example (ballistic position, standard technique):**
```typescript
// t in [0,1] over the shot's flight duration
function shellPosition(start: Vector3, end: Vector3, t: number, arcHeight: number): Vector3 {
  const pos = start.clone().lerp(end, t);
  pos.y += arcHeight * 4 * t * (1 - t); // parabola peaking at t=0.5
  return pos;
}
```

### Pattern 2: Trail via `useTrail` (not the declarative `<Trail>` wrapper)
**What:** `useTrail(targetObject, settings)` returns a ref to trail points without re-rendering React each frame — matches this project's existing performance discipline (04-01 decision: shader time via `useFrame` mutation, never React state, to avoid a per-frame re-render).
**When to use:** Shell smoke trail.
**Example (verified against installed `Trail.d.ts`):**
```typescript
// Source: node_modules/@react-three/drei/core/Trail.d.ts (installed v9.122.0)
const trailRef = useTrail(shellMeshRef.current, {
  length: 6,
  decay: 0.9,
  local: false,
  stride: 0.1,
  interval: 1,
});
```

### Pattern 3: Reusable Points-based Particle Burst
**What:** One parameterized component (`ParticleBurst`) driving `THREE.Points` with a `BufferGeometry` whose per-vertex velocities are randomized on spawn and integrated in `useFrame`; opacity fades via a shared `uOpacity`-style uniform or per-vertex alpha attenuation over the burst's lifetime, then the component unmounts. Configurable count/spread/color/lifetime covers splash (upward+outward, teal-white), explosion (outward+fire colors), and debris (slower, darker, longer-lived) from one implementation.
**When to use:** Impact splash, explosion, ship-destruction debris.
**Anti-pattern to avoid:** Don't mount/unmount a new `BufferGeometry`+`Material` per shot — pool and reset attribute arrays, or at minimum memoize the geometry/material the way `ShipModel` already memoizes per class key (04-02 decision), given shots repeat many times per game.

### Pattern 4: Sinking as an Additive Override on Top of Wave Bob
**What:** `FleetShips.tsx` already derives pitch/roll purely from `gerstnerHeight` finite-difference sampling every frame (04-02). A sinking ship needs a *second*, independent rotation/position component (list angle increasing over time, group's Y position dropping) added on top of — not replacing — that live wave sampling, so a half-sunk ship still bobs with the water instead of freezing mid-animation.
**When to use:** Ship destruction sequence.

### Anti-Patterns to Avoid
- **Mounting drei's `<CameraShake>` as a sibling of `CameraRig`:** confirmed incompatible — see Common Pitfalls.
- **New particle/VFX dependency for 3-4 effect types:** overkill per this project's established minimal-dependency pattern; hand-roll with `Points`.
- **Synthesizing the explosion boom purely from oscillators:** technically possible but a well-known hard case (needs real sub-bass + noise transient shaping) — budget for one small embedded sample instead of over-investing in synthesis quality for this one sound.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shell smoke trail | Manual array of past-position meshes | drei's `useTrail` | Already installed, ref-based (no re-render cost), handles decay/stride math correctly |
| Master volume + mute | Per-sound volume tracking | One `GainNode` as a master bus that every sound source connects through | Single source of truth for mute state, matches "persisted mute toggle" requirement in roadmap |
| Damped camera transitions for new cinematic states | A new animation approach for shell-follow | Same `MathUtils.damp` pattern `CameraRig` already uses (04-04 decision) | Consistency; the existing pattern already solves frame-rate-independent smoothing |

**Key insight:** This phase adds very little genuinely new machinery — it's mostly extending two patterns (`CameraRig`'s damp loop, `FleetShips`' additive wave-driven transform) that Phase 4 already validated, plus one new but simple primitive (particle burst) reused across effects.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: `CameraShake` Fights `CameraRig`'s `lookAt`
**What goes wrong:** Mounting drei's `<CameraShake>` alongside the existing `CameraRig` causes the camera to either not shake at all, or to snap to a stale rotation, depending on `useFrame` execution order — because `CameraShake` captures `camera.rotation` once and overwrites it additively from that snapshot every frame, while `CameraRig` recomputes rotation from `camera.lookAt()` every single frame regardless.
**Why it happens:** Both components own `camera.rotation` via independent `useFrame` callbacks with no coordination; verified directly by reading `CameraShake.js`'s source (captures `initialRotation` once via a ref, mutates `camera.rotation.set(...)` every frame relative to that stale snapshot).
**How to avoid:** Implement shake as an offset added inside `CameraRig`'s own `useFrame`, applied after the `lookAt()` call (e.g., nudge `lookAtTarget` or apply a small final rotation delta computed from a shared "shake intensity" value that decays over time), rather than mounting the drei component.
**Warning signs:** Camera jitters wildly then locks facing the wrong direction, or shake has no visible effect at all.

### Pitfall 2: Particle Effects Desyncing from the Water Clock
**What goes wrong:** A particle burst timed independently (its own `Date.now()`/local clock) drifts from the ocean and ship animation, especially noticeable when a splash needs to line up with the water surface height at the impact point.
**Why it happens:** 04-02's decision log already flags this exact class of bug: Ocean's `uTime` and ship wave-sampling both must read `clock.elapsedTime` from the same R3F clock — a splash effect sampling wave height for its spawn Y position must do the same, not accumulate its own delta.
**How to avoid:** Any particle burst that needs to know "where is the water surface right now" must call the same `gerstnerHeight` function from `waves.ts` with `clock.elapsedTime`, per the existing single-source-of-truth rule.
**Warning signs:** Splash appears floating above or sinking below the visible wave surface at the impact cell.

### Pitfall 3: Skippable ≤2.5s Budget vs. "Cinematic and Slow" Feel
**What goes wrong:** Trying to make the shell-follow + impact sequence feel genuinely slow/dramatic within a hard 2.5s cap (established in ROADMAP.md and reiterated in 05-CONTEXT.md as a real tension) risks either blowing the time budget or feeling rushed despite the camera work.
**Why it happens:** Camera dolly/follow motion reads as "slow" largely through easing curves and framing, not raw duration — a naive linear shell flight at "slow" speed simply won't fit in-budget for grid distances that can span the whole 10x10 board.
**How to avoid:** Decouple perceived speed from real duration: use ease-in/ease-out timing on the shell's `t` parameter (not linear), keep total flight+impact well under 2.5s, and lean on camera framing (tight FOV, follow-lag) rather than travel time for the "cinematic" feel. Flag as a planning-time decision, not something research can resolve outright.
**Warning signs:** Playtesting reveals shots feel either rushed or the skip becomes mandatory because players get impatient.

### Pitfall 4: Reduced-Effects Mode Is Phase 6's Job, But Shouldn't Be Architecturally Painful Later
**What goes wrong:** If particle bursts, trails, and shake are wired directly into game logic with no single toggle point, Phase 6's "reduced-effects mode holding 60fps" (already on the roadmap) becomes a scattered retrofit.
**Why it happens:** Cinematics code tends to accrete inline rather than behind one flag.
**How to avoid:** Not this phase's job to build the toggle, but each new effect component should be a clean, independently-mountable unit (already the natural shape from Pattern 3) so Phase 6 can gate them behind one condition later without restructuring.
**Warning signs:** N/A this phase — noted for forward compatibility only.
</common_pitfalls>

<code_examples>
## Code Examples

### Verified `useTrail` signature (from installed package, not web docs)
```typescript
// Source: node_modules/@react-three/drei/core/Trail.d.ts (v9.122.0, installed)
type Settings = {
  width: number;
  length: number;
  decay: number;
  local: boolean;
  stride: number;
  interval: number;
};
declare function useTrail(
  target: Object3D,
  settings: Partial<Settings>
): React.MutableRefObject<Float32Array | undefined>;
```
Note: the return type is `MutableRefObject<Float32Array | undefined>` (a flat typed array of points), not `Vector3[]` as some older web docs describe — confirmed by reading the actual `.d.ts` shipped with the installed version. Any planning/implementation should treat it as a `Float32Array`.

### Verified `CameraShake` signature (from installed package)
```typescript
// Source: node_modules/@react-three/drei/core/CameraShake.d.ts (v9.122.0, installed)
export interface ShakeController {
  getIntensity: () => number;
  setIntensity: (val: number) => void;
}
export interface CameraShakeProps {
  intensity?: number;
  decay?: boolean;
  decayRate?: number;
  maxYaw?: number;
  maxPitch?: number;
  maxRoll?: number;
  yawFrequency?: number;
  pitchFrequency?: number;
  rollFrequency?: number;
}
```
Useful as a reference for what parameters a hand-rolled shake-inside-`CameraRig` should expose (intensity, decay, per-axis max/frequency), even though the component itself isn't mountable as-is (Pitfall 1).

### Minimal WebAudio synthesized splash (illustrative pattern, not from a specific source)
```typescript
function playSplash(ctx: AudioContext, masterGain: GainNode) {
  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 800;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.6, ctx.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  noise.connect(filter).connect(envelope).connect(masterGain);
  noise.start();
}
```
</code_examples>

<sota_updates>
## State of the Art

Nothing significant has shifted in the R3F/drei/Three.js ecosystem in a way that changes this phase's approach — the pinned stack (04-01 decision) is deliberately not on latest, and the relevant primitives (`Trail`, `CameraShake`, `Points`) have been stable APIs in drei/three for multiple major versions. No new tool or pattern found that would supersede hand-rolled particle bursts or raw WebAudio for a scope this small.

**Deprecated/outdated:** None relevant found.
</sota_updates>

<open_questions>
## Open Questions

1. **Fully-synthesized audio vs. a few embedded compressed samples**
   - What we know: Raw WebAudio synthesis (oscillators, filtered noise, envelopes) reliably covers short mechanical/percussive sounds (splash, clicks, klaxon, sonar ping). ROADMAP.md itself frames this as an open choice ("WebAudio-generated vs tiny embedded samples").
   - What's unclear: Whether a synthesized explosion "boom" will sound convincing enough for the naval war-film aesthetic the user wants (05-CONTEXT.md), versus needing real low-frequency sample content.
   - Recommendation: Default to synthesis for everything; budget planning time to prototype the explosion boom early and fall back to one small embedded sample (a few KB, bundled — still "self-contained", no network fetch) specifically for that sound if synthesis doesn't land. Don't decide this in the abstract — verify by ear during 05-03's implementation.

2. **Gritty naval-film effects vs. the existing holographic teal aesthetic**
   - What we know: 05-CONTEXT.md explicitly flags this tension and asks for a deliberate resolution rather than a default.
   - What's unclear: The exact visual treatment (e.g., do explosions/smoke render in realistic colors while the grid/HUD stays holographic teal, layering two visual languages by depth — "grounded" world effects under a stylized UI layer — or does everything get a teal-tinted treatment to unify it?).
   - Recommendation: This is a design decision for `/gsd-plan-phase 5` or the phase's own checkpoint:decision, not something research can resolve — flagging it here so planning treats it as a first-class question rather than an implementation detail.

3. **Exact shell-follow camera transition in/out of the sequence**
   - What we know: `CameraRig` already supports two named views (`fleet`, `targeting`) via damped transitions between static configs.
   - What's unclear: Whether shell-follow should be a third named `CameraView` with a dynamically-updated target (not a static config), or a fully separate temporary camera-control component that suspends `CameraRig` for the sequence's duration.
   - Recommendation: Leaning toward extending `CameraRig` with a dynamic-target view (keeps one camera-owning component, consistent with 04-04's decision that `SceneRoot`'s `view` prop must be explicit) — but this is a planning-time architecture call.

</open_questions>

<sources>
## Sources

### Primary (HIGH confidence — verified directly against installed code)
- `/Users/jadkoby/Steel-Horizon/node_modules/@react-three/drei/core/Trail.d.ts` (v9.122.0, as installed)
- `/Users/jadkoby/Steel-Horizon/node_modules/@react-three/drei/core/CameraShake.d.ts` (v9.122.0, as installed)
- `/Users/jadkoby/Steel-Horizon/node_modules/@react-three/drei/core/CameraShake.js` (source read directly to confirm the rotation-overwrite behavior)
- `/Users/jadkoby/Steel-Horizon/client/src/scene/camera/CameraRig.tsx` (existing project code, confirms `lookAt()` called every frame)
- `/Users/jadkoby/Steel-Horizon/client/src/scene/ships/FleetShips.tsx` (existing project code, confirms wave-driven pitch/roll pattern)
- `.planning/STATE.md` — accumulated decisions from Phases 1-4 (04-01, 04-02, 04-04 decisions directly informed this research's recommendations)

### Secondary (MEDIUM confidence — WebSearch, not independently re-verified beyond the installed-package check above)
- [Drei Trail / useTrail docs](http://drei.docs.pmnd.rs/misc/trail-use-trail) — cross-checked against installed `.d.ts`; docs described return type as `Vector3[]` but installed types say `Float32Array` (installed types win)
- [wawa-vfx blog post](https://wawasensei.dev/blog/wawa-vfx-open-source-particle-system-for-react-three-fiber-projects) and [three.quarks GitHub](https://github.com/Alchemist0823/three.quarks) — considered and explicitly not recommended (see Alternatives Considered)
- [Procedural audio effects with Web Audio API](https://dev.to/hexshift/how-to-create-procedural-audio-effects-in-javascript-with-web-audio-api-199e) — general synthesis technique, not specific code verified

### Tertiary (LOW confidence — not independently verified, flagged for validation during implementation)
- Whether a synthesized explosion will meet the "naval war-film" bar aesthetically — this is a subjective/audible judgment call, not something WebSearch can settle (see Open Question 1)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: React Three Fiber 8.9.2 / drei 9.122.0 / three 0.185.1 cinematic sequencing
- Ecosystem: drei's `Trail`/`useTrail`/`CameraShake` primitives; Web Audio API
- Patterns: parabolic shell motion, particle bursts, additive sinking transform, camera shake composition
- Pitfalls: CameraShake/CameraRig incompatibility, wave-clock desync, duration-vs-feel budget

**Confidence breakdown:**
- Standard stack: HIGH — verified directly against `node_modules`, not just docs
- Architecture: HIGH — built directly on this project's own already-validated Phase 4 patterns
- Pitfalls: HIGH for the CameraShake incompatibility (verified by reading source); MEDIUM for the audio-quality judgment calls (inherently subjective)
- Code examples: HIGH for the drei type signatures (read from installed `.d.ts`); illustrative/unverified for the WebAudio splash snippet

**Research date:** 2026-07-06
**Valid until:** No expiry concern — findings are pinned to this project's exact installed dependency versions, which don't change without an explicit upgrade decision
</metadata>

---

*Phase: 05-cinematics-and-audio*
*Research completed: 2026-07-06*
*Ready for planning: yes*
