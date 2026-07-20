// Account auth: signup/login with scrypt-hashed passwords and persistent
// bearer tokens ("one-time login" — the client stores the token in
// localStorage and presents it on every visit; it only dies on logout).
//
// Kept deliberately framework-free: pure functions over the Db handle so
// both the Express routes (index.ts) and the socket handshake (socket.ts)
// consume the same logic, and tests can drive it against ":memory:".

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { authTokens, playerStats, users } from "./db/schema.js";

export const USERNAME_MIN = 2;
/** Long enough for an email address — browser autofill routinely puts one
 *  in this field, and rejecting it read as a broken form. */
export const USERNAME_MAX = 64;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 100;

/** Letters, digits, spaces, and name-safe symbols, including the `@`/`+`
 *  an email needs. Rendered all over the UI (leaderboards, lobby), so it
 *  stays display-safe — no markup characters. */
const USERNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.'@+-]*$/u;

export interface PublicUser {
  id: string;
  username: string;
}

export type AuthResult =
  | { ok: true; user: PublicUser; token: string }
  | { ok: false; error: string };

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64);
}

export function validateUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const username = raw.trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return null;
  }
  if (!USERNAME_PATTERN.test(username)) return null;
  return username;
}

export function validatePassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length < PASSWORD_MIN || raw.length > PASSWORD_MAX) return null;
  return raw;
}

async function mintToken(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(authTokens).values({ token, userId });
  return token;
}

export async function signUp(
  db: Db,
  rawName: unknown,
  rawPassword: unknown,
): Promise<AuthResult> {
  const username = validateUsername(rawName);
  if (username === null) {
    return {
      ok: false,
      error: `Call sign must be ${USERNAME_MIN}-${USERNAME_MAX} characters (letters, numbers, spaces).`,
    };
  }
  const password = validatePassword(rawPassword);
  if (password === null) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN} characters.`,
    };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, username.toLowerCase()))
    .limit(1);
  if (existing !== undefined) {
    return { ok: false, error: "That call sign is already taken." };
  }

  const salt = randomBytes(16);
  const id = randomUUID();
  await db.insert(users)
    .values({
      id,
      username,
      usernameLower: username.toLowerCase(),
      passwordHash: hashPassword(password, salt).toString("hex"),
      passwordSalt: salt.toString("hex"),
    });
  // Stats row exists from day one so profile reads never special-case a
  // player with zero games.
  await db.insert(playerStats).values({ userId: id });

  return { ok: true, user: { id, username }, token: await mintToken(db, id) };
}

export async function logIn(
  db: Db,
  rawName: unknown,
  rawPassword: unknown,
): Promise<AuthResult> {
  const username = validateUsername(rawName);
  const password = validatePassword(rawPassword);
  // Identical error for unknown user and wrong password — never leak which.
  const rejection: AuthResult = {
    ok: false,
    error: "Wrong call sign or password.",
  };
  if (username === null || password === null) return rejection;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.usernameLower, username.toLowerCase()))
    .limit(1);
  if (user === undefined) return rejection;

  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = hashPassword(password, Buffer.from(user.passwordSalt, "hex"));
  if (!timingSafeEqual(expected, actual)) return rejection;

  await db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, user.id));

  return {
    ok: true,
    user: { id: user.id, username: user.username },
    token: await mintToken(db, user.id),
  };
}

/** Resolve a bearer token to its user, refreshing last-used stamps. */
export async function userForToken(
  db: Db,
  token: unknown,
): Promise<PublicUser | null> {
  if (typeof token !== "string" || token.length === 0) return null;
  const [row] = await db
    .select({
      userId: authTokens.userId,
      username: users.username,
    })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(eq(authTokens.token, token))
    .limit(1);
  if (row === undefined) return null;

  const now = new Date();
  await db
    .update(authTokens)
    .set({ lastUsedAt: now })
    .where(eq(authTokens.token, token));
  await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, row.userId));

  return { id: row.userId, username: row.username };
}

/** Explicit logout: the token stops working everywhere it was copied. */
export async function revokeToken(db: Db, token: unknown): Promise<void> {
  if (typeof token !== "string" || token.length === 0) return;
  await db.delete(authTokens).where(eq(authTokens.token, token));
}
