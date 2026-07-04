// Server tuning knobs. Effective values are resolved from an options
// object passed into the server factory (tests inject tiny ones), with an
// optional environment override for production and the constant default
// as the fallback.

/** Default disconnect grace before an absent player forfeits (ms). */
export const RECONNECT_GRACE_MS = 60_000;

/**
 * Resolve the effective reconnect grace window.
 * Precedence: explicit override (tests) > RECONNECT_GRACE_MS env var >
 * the 60s default. Non-finite or non-positive candidates are ignored.
 */
export function resolveGraceMs(override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }
  const env = Number(process.env.RECONNECT_GRACE_MS);
  if (Number.isFinite(env) && env > 0) return env;
  return RECONNECT_GRACE_MS;
}
