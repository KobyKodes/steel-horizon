// Recorded SFX layer (contrast with arcadeSfx.ts's synthesized cues) — real
// mp3 clips for the big narrative beats. One-shots play via a fresh
// HTMLAudioElement each call so overlapping triggers (e.g. two sinks in
// quick succession) don't cut each other off. Fails silent wherever
// HTMLAudio/the network asset is unavailable.

function playOnce(src: string, volume = 1): void {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

/** A ship (yours or the enemy's) went down — trimmed to a 2s hit. */
export function sunkShipExplosion(): void {
  playOnce("/audio/sunk-ship-explosion.mp3", 0.7);
}

/** A shot lands and it's a miss — fired at cannon impact on the cell. */
export function missWaterSplash(): void {
  playOnce("/audio/miss-water-splash.mp3", 0.6);
}

/** The game ends and you lost. */
export function gameOverStinger(): void {
  playOnce("/audio/game-over.mp3", 0.8);
}

/** The game ends and you won. */
export function victoryStinger(): void {
  playOnce("/audio/victory.mp3", 0.8);
}

// Fleet-placement drums: a looping bed for the whole placement screen,
// started on mount and stopped on unmount — singleton so a fast-refresh or
// re-mount never stacks a second copy underneath.
let drums: HTMLAudioElement | null = null;

export function startFleetPlacementDrums(): void {
  if (typeof window === "undefined" || drums) return;
  try {
    drums = new Audio("/audio/fleet-placement-drums.mp3");
    drums.loop = true;
    drums.volume = 0.5;
    void drums.play().catch(() => {});
  } catch {
    drums = null;
  }
}

export function stopFleetPlacementDrums(): void {
  if (!drums) return;
  drums.pause();
  drums = null;
}
