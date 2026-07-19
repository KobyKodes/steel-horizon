import { useMemo } from "react";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import type { ShipClassId } from "@steel-horizon/shared";
import { SHIP_CLASSES, type ShipClassSpec } from "./ShipClasses";

// Procedural comic-book fleet — five bespoke silhouettes instead of one
// parameterized template, so every class is tellable at a glance from the
// near-top-down camera:
//
//   carrier    — overhanging flight deck with painted centerline dashes,
//                parked jets, starboard island tower
//   battleship — three twin-barrel turrets (aft one faces backward),
//                stepped pagoda bridge, raked funnel
//   cruiser    — two single turrets, tilted missile battery amidships,
//                twin slim funnels
//   submarine  — rounded capsule hull riding low, rounded sail with twin
//                periscopes, cross tail fins + prop cone
//   destroyer  — knife bow, twin raked funnels with ink caps, stern
//                depth-charge barrels
//
// Rendering language is unchanged from the first pass (matches the 2D
// chrome): cel-shaded MeshToonMaterial on a hard 3-step ramp, ink #10131a
// back-face outlines on every part, one bold hull color per class. All
// geometries/materials are memoized per class+sunk, never rebuilt per frame.

// Waterline placement. The extruded+beveled hull body spans local Y in
// [-0.25 * draft, +1.25 * draft] once rotated flat (bevelThickness adds
// 0.25 * draft beyond BOTH extrude faces). We shift it so KEEL_DEPTH of
// hull height sits below y=0 (the resting waterline) and the remainder
// rides above as visible freeboard — a floating ship, not a submerged or
// perched one.
const KEEL_DEPTH = 0.4; // fraction of draft below the waterline
const HULL_Y_MIN_RAW = -0.25; // pre-translate hull bottom, in drafts
const HULL_Y_MAX_RAW = 1.25; // pre-translate hull top (deck line), in drafts
const HULL_Y_SHIFT = -KEEL_DEPTH - HULL_Y_MIN_RAW; // = -0.15 drafts
/** Deck line height above the waterline, in multiples of draft. */
export const DECK_LINE = HULL_Y_MAX_RAW + HULL_Y_SHIFT; // = 1.1 drafts

const INK = "#10131a";
const STEEL_DARK = "#16202e";
const PAPER = "#f4f7ff";
const HIT_YELLOW = "#ffd21f";

// One bold comic color per class (hull + a contrasting accent for the
// superstructure) so classes are tellable at a glance from the top-down
// camera — the palette is the same ink/paper/radar-blue/hit-yellow set the
// 2D chrome uses, plus one vermilion note for the destroyer.
const CLASS_COLORS: Record<ShipClassId, { hull: string; accent: string }> = {
  carrier: { hull: "#f4f7ff", accent: "#4d9de8" },
  battleship: { hull: "#4d9de8", accent: "#f4f7ff" },
  cruiser: { hull: "#7ea8d4", accent: "#f4f7ff" },
  submarine: { hull: "#ffd21f", accent: "#16202e" },
  destroyer: { hull: "#ff5b66", accent: "#f4f7ff" },
};

// Sunk-ship damage tint: darkened, rust-red-shifted swaps for every
// material role (no geometry change — the wreck keeps its silhouette).
const SUNK = {
  hull: "#3a2426",
  deck: "#2a1c1e",
  accent: "#4a2e30",
  dark: "#241a1c",
  bright: "#5a3a34",
};

// Hard 3-step cel-shading ramp shared by every toon material. Three's toon
// shader reads only the texture's red channel, so RedFormat is sufficient.
const toonRamp = new THREE.DataTexture(
  new Uint8Array([125, 195, 255]),
  3,
  1,
  THREE.RedFormat,
);
toonRamp.minFilter = THREE.NearestFilter;
toonRamp.magFilter = THREE.NearestFilter;
toonRamp.needsUpdate = true;

function toonMaterial(color: string | THREE.Color): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });
}

/** The class color pulled down a step — the deck IS the ship's face from
    the top-down camera, so it must carry the class color, just darker than
    the hull sides so the silhouette still reads as layered. */
function deckColorFor(hull: string): THREE.Color {
  return new THREE.Color(hull).multiplyScalar(0.78);
}

/** Every material role a model can ask for, built once per class+sunk. */
interface Palette {
  hull: THREE.Material;
  deck: THREE.Material;
  accent: THREE.Material;
  /** Dark steel: turret housings, funnels, masts. */
  dark: THREE.Material;
  /** Bright pop: radar dishes, missile tips, painted stripes. */
  bright: THREE.Material;
  /** Paper-white: barrels, runway threshold. */
  paper: THREE.Material;
}

function buildPalette(shipClass: ShipClassId, sunk: boolean): Palette {
  const colors = CLASS_COLORS[shipClass];
  return {
    hull: toonMaterial(sunk ? SUNK.hull : colors.hull),
    deck: toonMaterial(sunk ? SUNK.deck : deckColorFor(colors.hull)),
    accent: toonMaterial(sunk ? SUNK.accent : colors.accent),
    dark: toonMaterial(sunk ? SUNK.dark : STEEL_DARK),
    bright: toonMaterial(sunk ? SUNK.bright : HIT_YELLOW),
    paper: toonMaterial(sunk ? SUNK.hull : PAPER),
  };
}

/** Ink back-face outline; thickness in world units along the normal. */
function Ink({ thickness = 0.13 }: { thickness?: number }) {
  return <Outlines thickness={thickness} color={INK} />;
}

/**
 * Extruded surface-ship hull. `bowSharpness` pushes the point where the
 * sides start tapering toward the bow: 0.75 is the stock cargo-ish nose,
 * higher values (destroyer 0.62 start → longer taper) read as a knife bow.
 */
function buildHullGeometry(
  spec: ShipClassSpec,
  bowTaperStart = 0.75,
): THREE.BufferGeometry {
  const { length, beam, draft } = spec;
  const halfBeam = beam / 2;

  // Profile drawn in the shape's local XY plane: X runs along the ship's
  // length (stern at 0, bow at `length`), Y is the beam (half-width) axis.
  const shape = new THREE.Shape();
  shape.moveTo(0, -halfBeam * 0.7);
  shape.lineTo(length * bowTaperStart, -halfBeam);
  shape.quadraticCurveTo(length, 0, length * bowTaperStart, halfBeam);
  shape.lineTo(0, halfBeam * 0.7);
  shape.quadraticCurveTo(-length * 0.04, 0, 0, -halfBeam * 0.7);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: draft,
    bevelEnabled: true,
    bevelThickness: draft * 0.25,
    bevelSize: halfBeam * 0.12,
    bevelSegments: 2,
    curveSegments: 12,
  });

  // Shape is extruded along local Z; rotate so the hull lies flat with
  // length along local X, draft (height) along local Y, beam along the
  // world Z axis. rotateX(-PI/2) maps the extrude axis to +Y, so the hull
  // body (including bevels) spans y in [HULL_Y_MIN_RAW, HULL_Y_MAX_RAW]
  // drafts. Shift it down so KEEL_DEPTH of the hull sits below the
  // waterline (y=0) and the deck line lands at DECK_LINE drafts above it.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, draft * HULL_Y_SHIFT, 0);

  return geometry;
}

/**
 * Gun turret: octagonal housing + 1–2 barrels with ink muzzle tips.
 * `facing` in radians about Y (0 = barrels toward the bow, PI = astern).
 */
function Turret({
  position,
  scale,
  barrels = 1,
  facing = 0,
  palette,
}: {
  position: [number, number, number];
  scale: number;
  barrels?: 1 | 2;
  facing?: number;
  palette: Palette;
}) {
  const offsets = barrels === 2 ? [-scale * 0.14, scale * 0.14] : [0];
  return (
    <group position={position} rotation-y={facing}>
      <mesh position={[0, scale * 0.16, 0]} material={palette.dark}>
        <cylinderGeometry args={[scale * 0.3, scale * 0.4, scale * 0.34, 8]} />
        <Ink thickness={0.05} />
      </mesh>
      {/* Gunhouse cap carries the class accent so turrets read on-brand. */}
      <mesh position={[0, scale * 0.34, 0]} material={palette.accent}>
        <cylinderGeometry args={[scale * 0.2, scale * 0.28, scale * 0.14, 8]} />
        <Ink thickness={0.04} />
      </mesh>
      {offsets.map((z) => (
        <group key={z} position={[scale * 0.42, scale * 0.2, z]}>
          <mesh rotation-z={Math.PI / 2} material={palette.paper}>
            <cylinderGeometry
              args={[scale * 0.05, scale * 0.05, scale * 0.75, 8]}
            />
            <Ink thickness={0.03} />
          </mesh>
          <mesh
            position={[scale * 0.4, 0, 0]}
            rotation-z={Math.PI / 2}
            material={palette.dark}
          >
            <cylinderGeometry
              args={[scale * 0.065, scale * 0.065, scale * 0.1, 8]}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Radar mast: pole + spinning-dish plate in hit-yellow. */
function Radar({
  position,
  palette,
}: {
  position: [number, number, number];
  palette: Palette;
}) {
  return (
    <group position={position}>
      <mesh material={palette.dark}>
        <cylinderGeometry args={[0.05, 0.05, 0.9, 6]} />
        <Ink thickness={0.03} />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation-x={Math.PI / 2} material={palette.bright}>
        <boxGeometry args={[0.5, 0.06, 0.14]} />
        <Ink thickness={0.03} />
      </mesh>
    </group>
  );
}

/** Raked smokestack with an ink cap band. */
function Funnel({
  position,
  radius,
  height,
  rake = 0.22,
  palette,
}: {
  position: [number, number, number];
  radius: number;
  height: number;
  rake?: number;
  palette: Palette;
}) {
  return (
    <group position={position} rotation-z={rake}>
      <mesh material={palette.dark}>
        <cylinderGeometry args={[radius * 0.85, radius, height, 10]} />
        <Ink thickness={0.05} />
      </mesh>
      <mesh position={[0, height * 0.42, 0]} material={palette.accent}>
        <cylinderGeometry args={[radius * 0.9, radius * 0.88, height * 0.18, 10]} />
        <Ink thickness={0.03} />
      </mesh>
    </group>
  );
}

/** Parked deck jet: wedge fuselage + swept wing plate + tail fin. */
function Jet({
  position,
  yaw,
  palette,
}: {
  position: [number, number, number];
  yaw: number;
  palette: Palette;
}) {
  return (
    <group position={position} rotation-y={yaw} scale={0.9}>
      <mesh position={[0, 0.06, 0]} material={palette.accent}>
        <coneGeometry args={[0.11, 0.75, 4]} />
        <Ink thickness={0.03} />
      </mesh>
      <mesh position={[-0.08, 0.05, 0]} rotation-y={Math.PI / 4} material={palette.dark}>
        <boxGeometry args={[0.34, 0.04, 0.34]} />
        <Ink thickness={0.02} />
      </mesh>
      <mesh position={[-0.24, 0.14, 0]} material={palette.dark}>
        <boxGeometry args={[0.1, 0.16, 0.03]} />
        <Ink thickness={0.02} />
      </mesh>
    </group>
  );
}

// --- Carrier: the floating runway -----------------------------------

function CarrierModel({ spec, palette }: { spec: ShipClassSpec; palette: Palette }) {
  const { length, beam, draft } = spec;
  const hullGeometry = useMemo(() => buildHullGeometry(spec), [spec]);
  const deckY = draft * DECK_LINE;
  const deckTop = deckY + draft * 0.24;
  // Painted centerline dashes down the flight deck.
  const dashes = useMemo(() => {
    const xs: number[] = [];
    for (let i = 0; i < 6; i++) xs.push(length * (0.12 + i * 0.15));
    return xs;
  }, [length]);

  return (
    <group>
      <mesh geometry={hullGeometry} material={palette.hull}>
        <Ink />
      </mesh>

      {/* Flight deck: one long slab overhanging the hull sides. */}
      <mesh position={[length * 0.48, deckY + draft * 0.12, 0]} material={palette.deck}>
        <boxGeometry args={[length * 0.99, draft * 0.24, beam * 1.14]} />
        <Ink thickness={0.07} />
      </mesh>

      {/* Runway markings: yellow centerline dashes + white bow threshold. */}
      {dashes.map((x) => (
        <mesh key={x} position={[x, deckTop + 0.012, 0]} material={palette.bright}>
          <boxGeometry args={[length * 0.055, 0.02, beam * 0.045]} />
        </mesh>
      ))}
      <mesh position={[length * 0.93, deckTop + 0.012, 0]} material={palette.paper}>
        <boxGeometry args={[length * 0.025, 0.02, beam * 0.8]} />
      </mesh>

      {/* Island tower, starboard side: stacked bridge + radar. */}
      <group position={[length * 0.6, deckTop, beam * 0.38]}>
        <mesh position={[0, draft * 0.55, 0]} material={palette.accent}>
          <boxGeometry args={[length * 0.13, draft * 1.1, beam * 0.24]} />
          <Ink thickness={0.06} />
        </mesh>
        <mesh position={[length * 0.01, draft * 1.28, 0]} material={palette.dark}>
          <boxGeometry args={[length * 0.08, draft * 0.36, beam * 0.2]} />
          <Ink thickness={0.04} />
        </mesh>
        <Radar position={[0, draft * 1.46 + 0.45, 0]} palette={palette} />
      </group>

      {/* Parked jets, port side, angled like a ready deck. */}
      <Jet position={[length * 0.3, deckTop, -beam * 0.28]} yaw={0.5} palette={palette} />
      <Jet position={[length * 0.48, deckTop, -beam * 0.3]} yaw={0.35} palette={palette} />
    </group>
  );
}

// --- Battleship: the gun line ----------------------------------------

function BattleshipModel({ spec, palette }: { spec: ShipClassSpec; palette: Palette }) {
  const { length, beam, draft } = spec;
  const hullGeometry = useMemo(() => buildHullGeometry(spec, 0.7), [spec]);
  const deckY = draft * DECK_LINE;
  const turretScale = beam * 0.52;

  return (
    <group>
      <mesh geometry={hullGeometry} material={palette.hull}>
        <Ink />
      </mesh>

      <mesh position={[length * 0.42, deckY, 0]} material={palette.deck}>
        <boxGeometry args={[length * 0.8, draft * 0.08, beam * 0.82]} />
      </mesh>

      {/* Main battery: two twin turrets forward (second superfiring), one aft
          facing astern — the classic dreadnought layout. */}
      <Turret position={[length * 0.82, deckY, 0]} scale={turretScale} barrels={2} palette={palette} />
      <Turret
        position={[length * 0.66, deckY + draft * 0.3, 0]}
        scale={turretScale}
        barrels={2}
        palette={palette}
      />
      <Turret
        position={[length * 0.12, deckY, 0]}
        scale={turretScale}
        barrels={2}
        facing={Math.PI}
        palette={palette}
      />

      {/* Pagoda bridge: three shrinking tiers + radar crown. */}
      <group position={[length * 0.44, deckY, 0]}>
        <mesh position={[0, draft * 0.55, 0]} material={palette.accent}>
          <boxGeometry args={[length * 0.15, draft * 1.1, beam * 0.52]} />
          <Ink thickness={0.06} />
        </mesh>
        <mesh position={[0, draft * 1.35, 0]} material={palette.accent}>
          <boxGeometry args={[length * 0.11, draft * 0.5, beam * 0.4]} />
          <Ink thickness={0.05} />
        </mesh>
        <mesh position={[0, draft * 1.78, 0]} material={palette.dark}>
          <boxGeometry args={[length * 0.07, draft * 0.36, beam * 0.28]} />
          <Ink thickness={0.04} />
        </mesh>
        <Radar position={[0, draft * 1.96 + 0.45, 0]} palette={palette} />
      </group>

      <Funnel
        position={[length * 0.28, deckY + draft * 0.7, 0]}
        radius={beam * 0.14}
        height={draft * 1.3}
        palette={palette}
      />
    </group>
  );
}

// --- Cruiser: the missile boat ---------------------------------------

function CruiserModel({ spec, palette }: { spec: ShipClassSpec; palette: Palette }) {
  const { length, beam, draft } = spec;
  const hullGeometry = useMemo(() => buildHullGeometry(spec, 0.72), [spec]);
  const deckY = draft * DECK_LINE;
  const turretScale = beam * 0.46;

  return (
    <group>
      <mesh geometry={hullGeometry} material={palette.hull}>
        <Ink />
      </mesh>

      <mesh position={[length * 0.42, deckY, 0]} material={palette.deck}>
        <boxGeometry args={[length * 0.78, draft * 0.07, beam * 0.8]} />
      </mesh>

      <Turret position={[length * 0.8, deckY, 0]} scale={turretScale} palette={palette} />
      <Turret
        position={[length * 0.1, deckY, 0]}
        scale={turretScale}
        facing={Math.PI}
        palette={palette}
      />

      {/* Bridge block + lattice mast. */}
      <group position={[length * 0.56, deckY, 0]}>
        <mesh position={[0, draft * 0.5, 0]} material={palette.accent}>
          <boxGeometry args={[length * 0.14, draft, beam * 0.48]} />
          <Ink thickness={0.05} />
        </mesh>
        <Radar position={[0, draft + 0.45, 0]} palette={palette} />
      </group>

      {/* Tilted missile battery amidships: canted box + yellow tube mouths —
          the cruiser's signature from above. */}
      <group position={[length * 0.34, deckY + draft * 0.32, 0]} rotation-z={0.5}>
        <mesh material={palette.dark}>
          <boxGeometry args={[draft * 0.9, draft * 0.55, beam * 0.5]} />
          <Ink thickness={0.04} />
        </mesh>
        {[-beam * 0.12, beam * 0.12].map((z) => (
          <mesh
            key={z}
            position={[draft * 0.32, draft * 0.29, z]}
            material={palette.bright}
          >
            <cylinderGeometry args={[draft * 0.11, draft * 0.11, draft * 0.1, 8]} />
            <Ink thickness={0.02} />
          </mesh>
        ))}
      </group>

      {/* Twin slim funnels. */}
      <Funnel
        position={[length * 0.46, deckY + draft * 0.55, 0]}
        radius={beam * 0.1}
        height={draft * 1.05}
        palette={palette}
      />
      <Funnel
        position={[length * 0.26, deckY + draft * 0.55, 0]}
        radius={beam * 0.1}
        height={draft * 1.05}
        palette={palette}
      />
    </group>
  );
}

// --- Submarine: the yellow cigar -------------------------------------

function SubmarineModel({ spec, palette }: { spec: ShipClassSpec; palette: Palette }) {
  const { length, beam, draft } = spec;
  const radius = beam * 0.62;
  // Capsule lies along X, centered mid-hull, riding low: only the top half
  // clears the waterline the way a surfaced boat does.
  const hullY = radius * 0.1;
  const hullGeometry = useMemo(() => {
    const geometry = new THREE.CapsuleGeometry(radius, length * 0.88, 6, 14);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
  }, [radius, length]);
  const topY = hullY + radius;

  return (
    <group position={[length / 2, 0, 0]}>
      {/* Recentered below; capsule is built around its own center. */}
      <mesh geometry={hullGeometry} position={[0, hullY, 0]} material={palette.hull}>
        <Ink thickness={0.1} />
      </mesh>

      {/* Walking deck ridge along the spine. */}
      <mesh position={[0, topY - radius * 0.08, 0]} material={palette.deck}>
        <boxGeometry args={[length * 0.62, radius * 0.22, beam * 0.34]} />
        <Ink thickness={0.04} />
      </mesh>

      {/* Sail: rounded dark tower + yellow trim cap + twin periscopes. */}
      <group position={[length * 0.08, topY, 0]}>
        <mesh position={[0, draft * 0.55, 0]} material={palette.accent}>
          <boxGeometry args={[length * 0.14, draft * 1.1, beam * 0.42]} />
          <Ink thickness={0.05} />
        </mesh>
        <mesh position={[length * 0.07, draft * 0.55, 0]} material={palette.accent}>
          <cylinderGeometry args={[beam * 0.21, beam * 0.21, draft * 1.1, 10]} />
          <Ink thickness={0.05} />
        </mesh>
        <mesh position={[0, draft * 1.14, 0]} material={palette.bright}>
          <boxGeometry args={[length * 0.15, draft * 0.1, beam * 0.46]} />
          <Ink thickness={0.03} />
        </mesh>
        <mesh position={[-length * 0.02, draft * 1.5, 0]} material={palette.dark}>
          <cylinderGeometry args={[0.035, 0.035, draft * 0.7, 6]} />
          <Ink thickness={0.02} />
        </mesh>
        <mesh position={[length * 0.03, draft * 1.38, 0]} material={palette.dark}>
          <cylinderGeometry args={[0.035, 0.035, draft * 0.45, 6]} />
          <Ink thickness={0.02} />
        </mesh>
      </group>

      {/* Tail: cross fins + propeller cone. */}
      <group position={[-length * 0.46, hullY, 0]}>
        <mesh material={palette.accent}>
          <boxGeometry args={[length * 0.09, radius * 2.4, radius * 0.22]} />
          <Ink thickness={0.03} />
        </mesh>
        <mesh material={palette.accent}>
          <boxGeometry args={[length * 0.09, radius * 0.22, radius * 2.4]} />
          <Ink thickness={0.03} />
        </mesh>
        <mesh
          position={[-length * 0.07, 0, 0]}
          rotation-z={Math.PI / 2}
          material={palette.dark}
        >
          <coneGeometry args={[radius * 0.42, length * 0.08, 8]} />
          <Ink thickness={0.03} />
        </mesh>
      </group>
    </group>
  );
}

// --- Destroyer: the greyhound -----------------------------------------

function DestroyerModel({ spec, palette }: { spec: ShipClassSpec; palette: Palette }) {
  const { length, beam, draft } = spec;
  const hullGeometry = useMemo(() => buildHullGeometry(spec, 0.6), [spec]);
  const deckY = draft * DECK_LINE;

  return (
    <group>
      <mesh geometry={hullGeometry} material={palette.hull}>
        <Ink />
      </mesh>

      <mesh position={[length * 0.4, deckY, 0]} material={palette.deck}>
        <boxGeometry args={[length * 0.72, draft * 0.06, beam * 0.78]} />
      </mesh>

      {/* Single forward turret. */}
      <Turret position={[length * 0.74, deckY, 0]} scale={beam * 0.44} palette={palette} />

      {/* Compact bridge with a mast light instead of a full radar. */}
      <group position={[length * 0.52, deckY, 0]}>
        <mesh position={[0, draft * 0.42, 0]} material={palette.accent}>
          <boxGeometry args={[length * 0.13, draft * 0.84, beam * 0.5]} />
          <Ink thickness={0.05} />
        </mesh>
        <mesh position={[0, draft * 1.2, 0]} material={palette.dark}>
          <cylinderGeometry args={[0.04, 0.04, draft * 0.8, 6]} />
          <Ink thickness={0.02} />
        </mesh>
        <mesh position={[0, draft * 1.62, 0]} material={palette.bright}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <Ink thickness={0.02} />
        </mesh>
      </group>

      {/* Twin sharply raked funnels — the speed signature. */}
      <Funnel
        position={[length * 0.36, deckY + draft * 0.5, 0]}
        radius={beam * 0.12}
        height={draft * 1.1}
        rake={0.34}
        palette={palette}
      />
      <Funnel
        position={[length * 0.22, deckY + draft * 0.5, 0]}
        radius={beam * 0.12}
        height={draft * 1.1}
        rake={0.34}
        palette={palette}
      />

      {/* Stern depth-charge rack: paired barrels ready to roll. */}
      {[-beam * 0.16, beam * 0.16].map((z) => (
        <mesh
          key={z}
          position={[length * 0.05, deckY + draft * 0.14, z]}
          rotation-z={Math.PI / 2}
          material={palette.dark}
        >
          <cylinderGeometry args={[beam * 0.09, beam * 0.09, beam * 0.26, 8]} />
          <Ink thickness={0.03} />
        </mesh>
      ))}
    </group>
  );
}

const MODELS: Record<
  ShipClassId,
  (props: { spec: ShipClassSpec; palette: Palette }) => JSX.Element
> = {
  carrier: CarrierModel,
  battleship: BattleshipModel,
  cruiser: CruiserModel,
  submarine: SubmarineModel,
  destroyer: DestroyerModel,
};

export function ShipModel({
  shipClass,
  sunk = false,
}: {
  shipClass: ShipClassId;
  /** Renders the hull/deck/superstructure with a dimmed damage tint. */
  sunk?: boolean;
}) {
  const spec = SHIP_CLASSES[shipClass];
  const palette = useMemo(() => buildPalette(shipClass, sunk), [shipClass, sunk]);
  const Model = MODELS[shipClass];

  return (
    // Every model is built stern-at-0/bow-at-length (the submarine
    // recenters itself); recenter so the model's own local origin (what
    // FleetShips positions in world space) is the ship's midpoint, not its
    // stern. Without this, placing ships by "position" causes neighboring
    // hulls to overlap by up to a full ship length.
    <group position={[-spec.length / 2, 0, 0]}>
      <Model spec={spec} palette={palette} />
    </group>
  );
}
