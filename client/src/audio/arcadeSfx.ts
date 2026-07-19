// Arcade scoring sound layer — a tiny WebAudio synth, zero assets. Every
// cue is a couple of enveloped oscillators, tuned so the chain is audible:
// the score tick's pitch climbs with the multiplier, sinks land a low slam
// plus a coin arpeggio, tier-ups play a rising fanfare, and a broken chain
// cracks downward. Fails silent wherever WebAudio is unavailable, and the
// context is created lazily on first use (after a user gesture, so the
// browser autoplay policy is satisfied by the click that fired the shot).

let sharedContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    sharedContext ??= new AudioContext();
    if (sharedContext.state === "suspended") void sharedContext.resume();
    return sharedContext;
  } catch {
    return null;
  }
}

interface ToneOptions {
  type?: OscillatorType;
  duration?: number;
  gain?: number;
  delay?: number;
  /** Hz to glide toward over the tone's duration (negative = downward). */
  slide?: number;
}

function tone(
  freq: number,
  { type = "square", duration = 0.08, gain = 0.05, delay = 0, slide = 0 }: ToneOptions = {},
): void {
  const ac = context();
  if (ac === null) return;
  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const envelope = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide !== 0) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(30, freq + slide),
      start + duration,
    );
  }
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(envelope).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Points landing — a two-note coin tick whose pitch climbs with the chain. */
export function scoreTick(multiplier: number): void {
  tone(500 + multiplier * 55, { duration: 0.06 });
  tone(760 + multiplier * 80, { delay: 0.05, duration: 0.05, gain: 0.035 });
}

/** A sink bonus — low hull thud, then a rising coin arpeggio. */
export function sinkSlam(): void {
  tone(90, { type: "sine", duration: 0.3, gain: 0.12, slide: -55 });
  [660, 880, 1150].forEach((freq, i) =>
    tone(freq, { delay: 0.13 + i * 0.07, duration: 0.09, gain: 0.05 }),
  );
}

/** Chain heat tier climbed — a three-note riser, brighter per tier. */
export function tierUp(tierIndex: number): void {
  [0, 1, 2].forEach((step) =>
    tone(400 * (1 + 0.3 * step) * (1 + 0.18 * tierIndex), {
      delay: step * 0.07,
      duration: 0.09,
      gain: 0.055,
    }),
  );
}

/** A miss broke the chain — a cracking downward buzz. */
export function chainBreak(): void {
  tone(340, { type: "sawtooth", duration: 0.3, gain: 0.07, slide: -270 });
  tone(150, { type: "square", delay: 0.08, duration: 0.22, gain: 0.06, slide: -95 });
}

/** A called shot went bust — chain break plus a losing-points womp. */
export function calledShotBust(): void {
  chainBreak();
  tone(220, { type: "triangle", delay: 0.2, duration: 0.35, gain: 0.08, slide: -110 });
}
