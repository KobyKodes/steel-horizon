// Sign in / sign up gate — the enlistment office. Shown whenever no account
// is signed in (App gates on store.authUser). One-time login: a success
// stores the bearer token in localStorage and the player never sees this
// screen again until they log out.

import { useState, type FormEvent } from "react";
import { useGameStore } from "../store";
import "./auth.css";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const authError = useGameStore((s) => s.authError);
  const authBusy = useGameStore((s) => s.authBusy);
  const signIn = useGameStore((s) => s.signIn);
  const signUpAccount = useGameStore((s) => s.signUpAccount);
  const clearAuthError = useGameStore((s) => s.clearAuthError);

  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit =
    !authBusy && username.trim().length >= 2 && password.length >= 6;

  function switchMode(next: Mode): void {
    if (next === mode) return;
    setMode(next);
    clearAuthError();
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!canSubmit) return;
    const name = username.trim();
    if (mode === "signin") void signIn(name, password);
    else void signUpAccount(name, password);
  }

  return (
    <div className="screen auth">
      <header className="auth-masthead">
        <h1>Steel Horizon</h1>
        <p className="auth-tagline">Fleet command wants you</p>
      </header>

      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-tabs" role="tablist" aria-label="Sign in or sign up">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "auth-tab selected" : "auth-tab"}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "auth-tab selected" : "auth-tab"}
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        {authError !== null && (
          <div className="auth-error" role="alert">
            {authError}
          </div>
        )}

        <label className="field">
          <span>Call sign</span>
          <input
            type="text"
            value={username}
            maxLength={64}
            autoComplete="username"
            placeholder={mode === "signup" ? "Pick your call sign" : "Your call sign"}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            maxLength={100}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button type="submit" className="auth-submit" disabled={!canSubmit}>
          {authBusy
            ? "Radioing HQ…"
            : mode === "signin"
              ? "Report for duty"
              : "Enlist"}
        </button>

        <p className="auth-hint">
          {mode === "signin" ? (
            <>
              New recruit?{" "}
              <button
                type="button"
                className="auth-switch"
                onClick={() => switchMode("signup")}
              >
                Enlist here
              </button>
            </>
          ) : (
            <>
              Already enlisted?{" "}
              <button
                type="button"
                className="auth-switch"
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </form>

      <p className="auth-footnote">
        One login, and your scores follow you to the leaderboards.
      </p>
    </div>
  );
}
