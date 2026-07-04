# Phase 4: 3D Ocean Scene - Research

**Researched:** 2026-07-04
**Domain:** React Three Fiber (Three.js) — ocean/water shaders, procedural mesh generation, buoyancy, camera rigs, performance
**Confidence:** HIGH

<research_summary>
## Summary

Researched the current (mid-2026) React Three Fiber ecosystem for building a stylized-realistic ocean scene: animated water, a holographic grid overlay, procedurally-built ship meshes that bob with the waves, and a camera system that transitions between a fleet view and a targeting view — all while the existing Zustand store + Socket.IO snapshot flow (Phases 1-3) keeps driving state unchanged.

**Critical finding:** `@react-three/drei` (verified directly against the published `9.122.0` type declarations, not just docs) does **not** export a `Water` or ocean helper. Water/ocean is *not* a drei primitive — it must be built from a custom `ShaderMaterial` (Gerstner-wave vertex displacement, the standard technique) or from three.js's own `examples/jsm/objects/Water.js` addon (a planar-reflection shader shipped inside the `three` package itself, so it stays within the project's "no external model/CDN downloads" constraint). Given the project's holographic/stylized aesthetic (not a photorealistic mirror-reflection ocean) and the 60fps budget, a custom lightweight Gerstner-wave shader plane is the better fit than `Water.js`'s reflection-camera technique, which renders the scene twice per frame.

**Version compatibility is the second critical finding:** the client is pinned to React 18.3 (Phase 1 decision, not up for renegotiation this phase). `@react-three/fiber@9.x` requires React 19 — installing latest-tag packages blind would break the app. The compatible line is `@react-three/fiber@8.9.2` + `@react-three/drei@9.122.0` (peer-verified: drei 9.122.0 requires `react ^18`, `@react-three/fiber ^8`).

**Primary recommendation:** `three@0.185` + `@react-three/fiber@8.9.2` + `@react-three/drei@9.122.0`. Build ocean water as a custom Gerstner-wave `ShaderMaterial` plane (not `drei`'s nonexistent `Water`, not `three`'s reflection-based `Water.js`). Build ships procedurally with `THREE.Shape` + `ExtrudeGeometry` for hulls plus primitive composition (cylinders/boxes) for superstructure/turrets/radar. Sample the *same* Gerstner wave function on the CPU per-frame to drive ship bob/pitch/roll — this is purely a cosmetic client-side effect layered on top of the authoritative grid-cell positions already coming from the server snapshot, so it needs no network sync. Camera transitions use R3F-native `useFrame` + `three/src/math/MathUtils.damp` (no GSAP/Theatre.js — those are new dependencies outside the project's locked stack).
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | 0.185.1 (latest) | 3D rendering engine | Already implied by project constraints; latest stable as of research date |
| @react-three/fiber | **8.9.2** (NOT 9.x) | React renderer for Three.js | 9.x requires React 19; client is pinned to React 18.3 (Phase 1 decision). 8.9.2 is the latest version whose peer deps say `react >=18.0` |
| @react-three/drei | **9.122.0** (NOT 10.x) | Helpers: Sky, Environment, PerformanceMonitor, Detailed, Instances, Stats, Cloud, Sparkles, OrbitControls | 10.x requires `@react-three/fiber ^9` + React 19. 9.122.0 peer-verified: `react ^18`, `@react-three/fiber ^8` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| stats.js / drei `<Stats />` or `<PerformanceMonitor />` | bundled with drei | FPS/draw-call visibility during dev | Add during 04-01 (ocean environment + perf baseline) so every subsequent plan can watch the budget |
| drei `<Detailed />` | bundled with drei | LOD switching by camera distance | Only if ship mesh polycount becomes an issue at fleet-view zoom-out; not needed day one |
| drei `<Instances>` | bundled with drei | Batches repeated geometry into one draw call | Candidate for the 10×10 holographic grid cells (100 identical quads/lines) in 04-03 |

### Explicitly NOT Adding
| Library | Why not |
|---------|---------|
| gsap / @gsap/react | Camera transitions are fully achievable with R3F's own `useFrame` + `damp`/`lerp`; adding an animation library is a new dependency outside the locked stack (React+Vite+TS, R3F+drei, Zustand, hand-written CSS) with no capability gap it fills |
| Theatre.js | Same reasoning — overkill for two discrete camera states (fleet view / targeting view), and it's aimed at scrubbable timeline editing, not a real-time game camera rig |
| Three.js Water Pro / TSL / WebGPU ocean kits | Paid product, targets WebGPU/TSL (not the WebGL path R3F 8.x uses by default), massive overkill for a stylized holographic-grid ocean; explicitly out of scope |
| cannon-es / Rapier / any physics engine | Ship "buoyancy" here is cosmetic bob/pitch driven by sampling the wave function directly — there is no rigid-body simulation need. A physics engine would be solving a problem this project doesn't have (ships don't collide, don't need collision response — position is server-authoritative) |

**Installation:**
```bash
npm install three@^0.185.1 @react-three/fiber@8.9.2 @react-three/drei@9.122.0 --workspace=@steel-horizon/client
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure (extends existing `client/src/`)
```
client/src/
├── scene/                    # New in Phase 4 — everything 3D
│   ├── Ocean.tsx              # Gerstner-wave shader plane
│   ├── waves.ts                # Shared wave-function math (used by shader uniforms AND CPU sampling)
│   ├── SkyDome.tsx             # Sky/sun/fog/time-of-day
│   ├── ships/
│   │   ├── ShipHull.tsx        # ExtrudeGeometry hull per class
│   │   ├── ShipClasses.ts      # Per-class dimension/turret-count tables (Carrier/Battleship/Cruiser/Submarine/Destroyer)
│   │   └── FleetShips.tsx      # Places+bobs ships from snapshot.you.fleet / revealedOpponentFleet
│   ├── grid/
│   │   └── HoloGrid.tsx        # Instanced holographic 10x10 overlay (built in 04-03)
│   ├── camera/
│   │   └── CameraRig.tsx       # useFrame-driven damp between fleet-view/targeting-view targets
│   └── SceneRoot.tsx           # <Canvas> root composing Ocean+SkyDome+ships+grid+CameraRig
├── screens/                  # Existing (Placement/Battle/PostGame) — will mount SceneRoot instead of 2D board in 04-03/04-04
├── store/                    # Existing Zustand store — untouched; scene reads from it, never mutates game state
```

### Pattern 1: Gerstner Wave — Single Source of Truth for Shader AND CPU
**What:** Write the Gerstner displacement formula once in `waves.ts` as a plain TS function `gerstnerHeight(x, z, time, params) -> {y, normal}`. Feed the *same* `params` as uniforms into the GLSL vertex shader for the visual water plane, and call the *same* TS function on the CPU each frame to compute each ship's bob/pitch/roll offset.
**When to use:** Any time a visual effect (water) and a gameplay/cosmetic effect (ship floating) must move in lockstep. Two independent implementations (one GLSL, one hand-tuned JS sine) will visibly desync.
**Example:**
```glsl
// Source: standard Gerstner wave vertex shader pattern (Three.js forum "Classic Ocean Shader Example with Gerstner Waves")
uniform float uTime;
uniform vec4 uWaveA; // dirX, dirZ, steepness, wavelength
varying vec3 vNormal;

vec3 gerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
  float steepness = wave.z;
  float wavelength = wave.w;
  float k = 2.0 * 3.14159265 / wavelength;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(wave.xy);
  float f = k * (dot(d, p.xz) - c * uTime);
  float a = steepness / k;

  tangent += vec3(-d.x * d.x * (steepness * sin(f)), d.x * (steepness * cos(f)), -d.x * d.y * (steepness * sin(f)));
  binormal += vec3(-d.x * d.y * (steepness * sin(f)), d.y * (steepness * cos(f)), -d.y * d.y * (steepness * sin(f)));
  return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
}
```
```typescript
// Mirrored on CPU for ship buoyancy — same wave constants imported from waves.ts
export function gerstnerHeight(x: number, z: number, time: number, wave: WaveParams): number {
  const k = (2 * Math.PI) / wave.wavelength
  const c = Math.sqrt(9.8 / k)
  const f = k * (wave.dirX * x + wave.dirZ * z - c * time)
  return (wave.steepness / k) * Math.sin(f)
}
```

### Pattern 2: Procedural Hull via Shape + ExtrudeGeometry
**What:** Define the hull's top-down 2D profile as a `THREE.Shape` (pointed bow, flat stern), extrude it for the hull depth, then taper/scale via vertex manipulation or a tapered bevel for the hull's cross-section curve.
**When to use:** All 5 ship classes — vary the `THREE.Shape` control points and extrude depth/width per class (Carrier longest/widest, Destroyer shortest/narrowest), keeping one shared hull-builder function parameterized by class dimensions.
**Example:**
```typescript
// Source: three.js docs ExtrudeGeometry + standard hull-profile technique
const hullShape = new THREE.Shape()
hullShape.moveTo(0, -halfBeam)
hullShape.lineTo(length * 0.8, -halfBeam * 0.6)
hullShape.quadraticCurveTo(length, 0, length * 0.8, halfBeam * 0.6) // pointed bow
hullShape.lineTo(0, halfBeam)
hullShape.lineTo(-length * 0.05, 0) // flat stern taper
hullShape.closePath()

const hullGeometry = new THREE.ExtrudeGeometry(hullShape, {
  depth: draftHeight,
  bevelEnabled: true,
  bevelThickness: draftHeight * 0.2,
  bevelSize: halfBeam * 0.1,
  bevelSegments: 2,
})
hullGeometry.rotateX(-Math.PI / 2) // shape is drawn in XY, rotate to lie flat on XZ
```
Superstructure, turrets, and radar are then composed from primitive geometries (`BoxGeometry`, `CylinderGeometry`, `ConeGeometry`) positioned relative to the hull's local origin — no need for `ExtrudeGeometry` there.

### Pattern 3: Camera Rig via useFrame + damp (no animation library)
**What:** Keep two target `Vector3` pairs (position + lookAt) for "fleet view" and "targeting view." On view-mode change (driven by which screen/snapshot phase is active), drive the active camera's position/lookAt toward the new target every frame using `three/src/math/MathUtils.damp` (frame-rate independent exponential smoothing), not a raw `lerp` (which is frame-rate dependent and needs a fixed alpha).
**When to use:** Any two-state or few-state camera transition in a game loop context — this is the R3F-idiomatic replacement for GSAP/Theatre.js when the transition is driven by discrete app state (not scrubbable/timeline content).
**Example:**
```typescript
// Source: R3F community pattern (sbcode.net "Lerp" + Three.js MathUtils.damp docs)
import { damp3 } from 'maath/easing' // small, already-common R3F ecosystem helper; OR hand-roll with THREE.MathUtils.damp per-axis
useFrame((state, delta) => {
  damp3(cameraRef.current.position, targetPosition, 0.25, delta)
  damp3(lookAtTarget.current, targetLookAt, 0.25, delta)
  cameraRef.current.lookAt(lookAtTarget.current)
})
```
Note: `maath` is a small pmndrs utility library, commonly pulled in transitively by drei; if not already present after installing drei 9.122.0, hand-rolling with `THREE.MathUtils.damp` per axis (x/y/z separately) avoids adding it as an explicit dependency.

### Anti-Patterns to Avoid
- **Reaching for `drei`'s `Water` component:** it does not exist in the installed version (verified against the actual `.d.ts`, not assumed from stale docs/tutorials that reference other water kits).
- **Two independent wave implementations (shader vs. ship bob):** causes visible desync between water surface and floating ships; always derive both from one shared function/constants.
- **Reflection-based `Water.js` for this scene:** doubles render cost (mirrored scene pass) for a look (photoreal reflections) that doesn't match the stated "glowing holographic grid" stylized aesthetic — reserve for a stretch goal only if performance budget allows after 04-01's baseline.
- **Creating new `THREE.ShaderMaterial`/geometry instances inside `useFrame` or component render:** always construct once (module scope, `useMemo`, or `useRef`), mutate uniforms/transforms only.
- **GSAP/Theatre.js for camera transitions:** unnecessary new dependency; R3F's own `useFrame` + damp covers the two-view transition case entirely.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sky/sun/fog/time-of-day gradient | Custom skybox shader from scratch | `@react-three/drei`'s `<Sky>` (wraps three's `Sky.js` addon) | Physically-based Rayleigh/Mie scattering sky is a solved problem with tunable `turbidity`/`sunPosition` props; verified present in drei 9.122.0's exports |
| Repeated identical grid-cell meshes | 100 individual `<mesh>` per grid cell | drei's `<Instances>`/`<Instance>` | One draw call instead of 100; verified present in drei 9.122.0 |
| FPS/draw-call monitoring during dev | Manual `console.log` frame timing | drei's `<Stats>`/`<StatsGl>` or `<PerformanceMonitor>` | Both verified present in drei 9.122.0; `PerformanceMonitor` can also auto-downgrade quality, useful groundwork for Phase 6's reduced-effects mode |
| Camera distance-based mesh simplification (if ever needed) | Manual distance checks + geometry swap | drei's `<Detailed>` | Verified present in drei 9.122.0; handles the transition/hysteresis logic |
| Frame-rate-independent smoothing | Hand-rolled `lerp(a, b, delta * speed)` (drifts with variable frame time) | `THREE.MathUtils.damp` (or `maath`'s `damp3` if already a transitive dep) | `damp` is exponential-decay based and frame-rate independent by construction; naive lerp-with-delta is a common near-miss that looks fine at 60fps and stutters at 30fps |

**Key insight:** Everything needed for this phase (sky, instancing, perf monitoring, LOD) already ships inside `@react-three/drei` — confirmed by reading the actual type exports, not assumed from general "drei has everything" folklore. The one thing drei does *not* ship is water/ocean, which is the phase's one genuinely custom piece and is a well-documented technique (Gerstner shader), not an unsolved problem.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Installing `@react-three/fiber@latest` (9.x) Against React 18
**What goes wrong:** `npm install` succeeds (npm doesn't hard-block on peer mismatches by default) but the app fails at runtime with cryptic React reconciler errors, or React itself gets silently bumped to 19 by npm's peer resolution, breaking the existing Zustand-driven client from Phases 1-3.
**Why it happens:** `@react-three/fiber@9` requires `react >=19 <19.3`; the client's `package.json` currently pins `react@^18.3.0` (a Phase 1 decision not open for renegotiation this phase).
**How to avoid:** Pin exact compatible versions in the install command: `@react-three/fiber@8.9.2` and `@react-three/drei@9.122.0` (peer-verified against React 18 today; re-verify if this plan is executed much later, as `8.9.2`/`9.122.0` may not remain "latest" of their major line forever).
**Warning signs:** `npm ls react` showing two react versions, or React DOM warnings about multiple React instances/hook errors inside `<Canvas>`.

### Pitfall 2: Treating the Ocean's Vertex Displacement as the Ship's Ground Truth Position
**What goes wrong:** Ships appear to swim through the water surface or hover above it, especially at wave crests/troughs, if the ship's Y-position sampling uses different wave constants (amplitude/wavelength/speed) than the shader actually renders with.
**Why it happens:** It's tempting to write "good enough" separate sine-wave bobbing for ships (simpler math) alongside the "real" Gerstner shader for the water plane — the two will drift apart over time or at different world positions.
**How to avoid:** Single shared `waves.ts` module exporting both the wave parameter constants and a pure `gerstnerHeight(x, z, time)` function; the GLSL shader's uniforms and the CPU ship-positioning code both read from this one source.
**Warning signs:** Ships visually "floating" above the water plane or clipping into it, worse at higher wave amplitudes.

### Pitfall 3: Draw-Call Budget Blown by Naive Ship/Grid Rendering
**What goes wrong:** Two fleets × 5 ships × (hull + superstructure + turrets + radar, each a separate mesh) plus a 10×10 holographic grid rendered as 100 individual meshes can approach or exceed the "few hundred draw calls" danger zone researched for 60fps, especially combined with the ocean shader plane's own segment count.
**Why it happens:** Each `<mesh>` in R3F is a separate draw call by default; it's easy to compose a ship from 6-8 separate primitive meshes without noticing the multiplier across 10 ships and a full grid.
**How to avoid:** Merge each ship's static primitives into one `BufferGeometry` per ship (via geometry merging, or accept ~6-8 draw calls per ship since ships are few — 10 total, so ~60-80 draw calls is fine) and specifically instance the grid cells (100 cells → 1 draw call via `<Instances>`) rather than naively mapping 100 `<mesh>` elements.
**Warning signs:** `renderer.info.render.calls` (inspectable via drei's `<Stats>`) climbing into the hundreds; frame time spikes when both fleets and the grid are visible simultaneously.

### Pitfall 4: Rebuilding Geometries/Materials Every Render
**What goes wrong:** Creating `new THREE.ShaderMaterial(...)` or `new THREE.ExtrudeGeometry(...)` directly in a component body (not memoized) causes GPU resource churn on every React re-render, particularly since the ocean shader's `uTime` uniform updates every frame via `useFrame` and could accidentally trigger a parent re-render if wired through React state instead of a ref/uniform mutation.
**Why it happens:** React's render model doesn't automatically imply "construct once" for imperative Three.js objects; `uTime` in particular must be a mutated `uniforms.uTime.value`, never a React state variable re-rendering the component every frame.
**How to avoid:** Construct all geometries/materials in `useMemo` (or module scope for pure functions of static params), and drive all per-frame animation (wave time, ship bob offsets, camera damp) through refs/uniforms mutated inside `useFrame`, never through `useState`/`setState` per frame.
**Warning signs:** React DevTools showing the 3D component tree re-rendering every frame; frame time dominated by JS (geometry construction) rather than GPU (draw calls).
</common_pitfalls>

<code_examples>
## Code Examples

### Ocean Shader Plane Setup
```typescript
// Source: pattern verified against Three.js forum "Classic Ocean Shader Example with Gerstner Waves"
// and confirmed drei has no competing Water helper (checked @react-three/drei@9.122.0 type exports directly)
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function Ocean() {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const geometry = useMemo(() => new THREE.PlaneGeometry(500, 500, 256, 256), [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWaveA: { value: new THREE.Vector4(1, 0.3, 0.15, 40) },
    },
    vertexShader: /* glsl */`...gerstnerWave(...) displacing position.y...`,
    fragmentShader: /* glsl */`...fresnel + color gradient for holographic tint...`,
  }), [])

  useFrame((_, delta) => {
    materialRef.current.uniforms.uTime.value += delta
  })

  return <mesh geometry={geometry} material={material} ref={m => materialRef.current = material} rotation-x={-Math.PI / 2} />
}
```

### Instanced Holographic Grid (drei)
```typescript
// Source: drei core Instances/Detailed pattern, verified exported in @react-three/drei@9.122.0
import { Instances, Instance } from '@react-three/drei'

function HoloGrid({ size = 10, cellSize = 1 }) {
  const cells = useMemo(() =>
    Array.from({ length: size * size }, (_, i) => ({
      x: (i % size) * cellSize,
      z: Math.floor(i / size) * cellSize,
    })), [size, cellSize])

  return (
    <Instances limit={size * size}>
      <planeGeometry args={[cellSize * 0.9, cellSize * 0.9]} />
      <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.4} />
      {cells.map((c, i) => (
        <Instance key={i} position={[c.x, 0.01, c.z]} rotation-x={-Math.PI / 2} />
      ))}
    </Instances>
  )
}
```

### Performance Monitoring Setup (drei)
```typescript
// Source: drei PerformanceMonitor, verified exported in @react-three/drei@9.122.0
import { PerformanceMonitor, Stats } from '@react-three/drei'

function SceneRoot() {
  const [dpr, setDpr] = useState(1.5)
  return (
    <Canvas dpr={dpr}>
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      {process.env.NODE_ENV === 'development' && <Stats />}
      {/* ...ocean, ships, grid, camera rig... */}
    </Canvas>
  )
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manually tracking `@react-three/fiber`/`drei` latest tags | Explicit major-version pinning against React 18 vs 19 | Ongoing since R3F 9 (React 19-only) released | Any future dependency bump in this project must re-check peer deps against React 18 — R3F 9/drei 10 are React-19-only and will NOT silently work |
| WebGL-only ocean rendering | WebGPU/TSL-based FFT ocean kits (e.g., "Three.js Water Pro") emerging in 2026 | 2025-2026 | Not relevant to this project — targets a different renderer backend and is a paid product; the classic Gerstner-shader-on-WebGL approach remains the correct fit here |
| GSAP for all Three.js camera work | R3F-native `useFrame` + `damp`/`maath` for state-driven transitions; GSAP/Theatre.js reserved for scrubbable/timeline-driven sequences | Established practice, not new | Confirms the plan to avoid adding GSAP as a dependency for this phase's two-state camera rig |

**New tools/patterns to consider (not needed this phase, noted for Phase 5):**
- `@react-three/postprocessing` for bloom/screen-shake in the firing-cinematics phase (Phase 5) — out of scope for Phase 4.

**Deprecated/outdated:**
- None specific to this phase's scope found; three.js's `examples/jsm/objects/Water.js` and `Sky.js` addons remain present and functional in `three@0.185.1` (verified directly against the `r185` tag on GitHub).
</sota_updates>

<open_questions>
## Open Questions

1. **Exact holographic grid + ship visual style (color palette, glow intensity, fog density)**
   - What we know: PROJECT.md specifies "glowing holographic grid overlay," "stylized-realistic low-poly-but-detailed" ships, sun glare + subtle fog + time-of-day gradient.
   - What's unclear: Specific hex colors, exact fog density curve, whether time-of-day is static-per-match or animates during play.
   - Recommendation: Treat as an implementation/creative decision during 04-01/04-03 execution (or a `checkpoint:decision` in the plan if the executing agent wants to present 2-3 concrete palette options), not a blocking research gap — this is aesthetic taste, not a technical unknown.

2. **Whether `maath` (pmndrs' small math-helper package) is already present as a transitive dependency of drei 9.122.0, or needs an explicit install for `damp3`**
   - What we know: `maath` is commonly bundled/recommended alongside drei in R3F tutorials for `easing.damp3`.
   - What's unclear: Didn't confirm it's a direct/transitive dependency of `@react-three/drei@9.122.0` specifically (would need `npm ls maath` after install).
   - Recommendation: Default to hand-rolling with `THREE.MathUtils.damp` per-axis (already inside `three`, zero new dependency) unless `maath` turns out already present; only add it as an explicit dependency if genuinely convenient and the executing agent confirms it's not adding real new dependency weight.

3. **Fleet-view vs. targeting-view exact framing (angle, distance, whether both boards are visible simultaneously in fleet view)**
   - What we know: Roadmap phase 04-04 explicitly owns "camera system & view integration," listed as its own plan.
   - What's unclear: Precise camera parameters — out of this research's scope, belongs to 04-04's planning/execution.
   - Recommendation: 04-01 through 04-03 should build ocean/ships/grid without hard-wiring camera assumptions beyond "there will be a camera rig later"; keep `SceneRoot.tsx` camera-agnostic until 04-04.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- https://registry.npmjs.org/@react-three/fiber (dist-tags + peerDependencies for 9.6.1 and 8.9.2, fetched directly)
- https://registry.npmjs.org/@react-three/drei (dist-tags + peerDependencies for latest 10.7.7 and stable 9.122.0, fetched directly)
- https://registry.npmjs.org/three (dist-tags, fetched directly)
- https://unpkg.com/@react-three/drei@9.122.0/core/index.d.ts (actual type exports fetched directly — confirmed `Sky`, `Cloud`, `Sparkles`, `Instances`, `Detailed`, `PerformanceMonitor`, `Stats`, `StatsGl`, `Environment`, `OrbitControls` all present; confirmed NO `Water` export)
- https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/jsm/objects/Water.js and .../Sky.js (confirmed both addons exist and are fetchable at the r185 tag matching the installed three version)
- https://r3f.docs.pmnd.rs/advanced/scaling-performance (official R3F docs: draw-call budget "few hundred or less, max 1000", instancing, LOD via Detailed, PerformanceMonitor, frameloop="demand")

### Secondary (MEDIUM confidence)
- Three.js forum "Classic Ocean Shader Example with Gestner Waves" (https://discourse.threejs.org/t/classic-ocean-shader-example-with-gestner-waves/29227) — Gerstner wave GLSL pattern, cross-checked against the general well-known Gerstner formula (standard, not project-specific)
- Codrops "Creating Stylized Water Effects with React Three Fiber" (2025) (https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/) — confirms custom-shader-plane is the current community approach for stylized (non-photoreal) water in R3F
- sbcode.net "Lerp" (https://sbcode.net/react-three-fiber/lerp/) and Medium "Animate a Camera in React Three Fiber" — confirms `useFrame` + damp/lerp as the standard R3F camera-animation pattern without external libraries

### Tertiary (LOW confidence - needs validation)
- Exact production-readiness of "Three.js Water Pro" 2026 product mentioned in search results — not investigated further as it's explicitly excluded (paid, WebGPU/TSL-targeted, out of scope)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: React Three Fiber 8.x + Three.js 0.185 (React-18-compatible line, not the React-19-only 9.x line)
- Ecosystem: @react-three/drei 9.122.0 helpers (Sky, Instances, Detailed, PerformanceMonitor, Stats)
- Patterns: Gerstner-wave water shader + shared CPU sampling for buoyancy, procedural hull via ExtrudeGeometry, useFrame-driven camera damping
- Pitfalls: React 18/19 peer-dependency mismatch, wave/buoyancy desync, draw-call budget, geometry/material re-creation

**Confidence breakdown:**
- Standard stack: HIGH — versions and peer dependencies fetched directly from the npm registry, not inferred
- Architecture: HIGH — patterns cross-referenced against official three.js docs, R3F official performance docs, and multiple independent tutorials that agree
- Pitfalls: HIGH — the React 18/19 mismatch and drei's missing Water export were both verified by inspecting actual package metadata/type files, not assumed from documentation prose
- Code examples: MEDIUM-HIGH — Gerstner shader snippet follows the standard published formula (widely reproduced, not vendor-specific); drei usage snippets verified against actual exported symbols

**Research date:** 2026-07-04
**Valid until:** 2026-08-04 (30 days — pin exact versions used; re-verify peer deps if this plan sits unexecuted longer, since the R3F/drei ecosystem ships frequently)
</metadata>

---

*Phase: 04-3d-ocean-scene*
*Research completed: 2026-07-04*
*Ready for planning: yes*
</content>
