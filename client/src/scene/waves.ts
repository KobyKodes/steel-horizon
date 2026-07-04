// Single source of truth for Gerstner wave math.
//
// Both the Ocean shader (GLSL uniforms) and any CPU-side sampling (e.g. a
// ship's bob/pitch offset in a later plan) MUST read these exact constants
// and use gerstnerHeight() rather than re-deriving an approximate sine wave.
// Two independent implementations will visibly desync over time.

export interface WaveParams {
  /** X component of the (will be normalized) horizontal wave direction. */
  dirX: number;
  /** Z component of the (will be normalized) horizontal wave direction. */
  dirZ: number;
  /** Steepness of the wave (controls displacement amplitude relative to wavelength). */
  steepness: number;
  /** Wavelength in world units. */
  wavelength: number;
}

// Three layered waves: a long, low-frequency swell plus two shorter,
// crosswise waves for surface detail. Directions are given un-normalized;
// gerstnerHeight normalizes them.
//
// Steepness values are tuned against ship scale (ShipClasses.ts): the
// summed crest amplitude must stay comfortably below the smallest hull's
// freeboard, or ships riding a trough disappear behind the neighboring
// crest and read as sunk.
export const WAVES: WaveParams[] = [
  { dirX: 1.0, dirZ: 0.3, steepness: 0.11, wavelength: 40 },
  { dirX: 0.6, dirZ: -0.8, steepness: 0.07, wavelength: 22 },
  { dirX: -0.3, dirZ: 1.0, steepness: 0.05, wavelength: 12 },
];

const GRAVITY = 9.8;

/**
 * Pure Gerstner-wave height sample at world-space (x, z) and time (seconds).
 * Sums the contribution of every wave in `waves`. Mirrors the GLSL
 * `gerstnerWave` function in Ocean.tsx term-for-term — keep them in sync.
 */
export function gerstnerHeight(
  x: number,
  z: number,
  time: number,
  waves: WaveParams[] = WAVES,
): number {
  let y = 0;
  for (const wave of waves) {
    const len = Math.hypot(wave.dirX, wave.dirZ) || 1;
    const dx = wave.dirX / len;
    const dz = wave.dirZ / len;
    const k = (2 * Math.PI) / wave.wavelength;
    const c = Math.sqrt(GRAVITY / k);
    const f = k * (dx * x + dz * z - c * time);
    const a = wave.steepness / k;
    y += a * Math.sin(f);
  }
  return y;
}
