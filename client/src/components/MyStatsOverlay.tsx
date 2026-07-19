// "My stats" overlay — the signed-in player's service record, read from
// GET /players/:name/stats. Class names all prefixed `ms-` per the
// unique-class-name rule; shell mirrors the lb-/sg- overlays.

import { useEffect, useState } from "react";
import "./myStats.css";

type GameMode = "pvp" | "bot_easy" | "bot_medium" | "bot_hard";

interface PlayerProfile {
  username: string;
  memberSince: string;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    totalPoints: number;
    bestScore: number;
    totalHits: number;
    totalMisses: number;
    accuracy: number;
    totalShipsSunk: number;
    currentWinStreak: number;
    bestWinStreak: number;
    bots: Record<"easy" | "medium" | "hard", { played: number; won: number }>;
  };
  recentGames: {
    mode: GameMode;
    score: number;
    won: boolean;
    accuracy: number;
    date: string;
  }[];
}

const MODE_LABELS: Record<GameMode, string> = {
  pvp: "vs Player",
  bot_easy: "vs Cadet Bot",
  bot_medium: "vs Captain Bot",
  bot_hard: "vs Admiral Bot",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One big stamped number with its label — the headline stats. */
function StatTile({
  value,
  label,
  loud = false,
}: {
  value: string | number;
  label: string;
  loud?: boolean;
}) {
  return (
    <div className={loud ? "ms-tile loud" : "ms-tile"}>
      <span className="ms-tile-value">{value}</span>
      <span className="ms-tile-label">{label}</span>
    </div>
  );
}

export default function MyStatsOverlay({
  username,
  onClose,
}: {
  username: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/players/${encodeURIComponent(username)}/stats`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PlayerProfile>;
      })
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const stats = profile?.stats;
  const winRate =
    stats === undefined || stats.gamesPlayed === 0
      ? 0
      : Math.round((stats.gamesWon / stats.gamesPlayed) * 100);

  return (
    <div className="ms-overlay" onClick={onClose}>
      <div
        className="ms-card"
        role="dialog"
        aria-label="My stats"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="ms-close"
          aria-label="Close my stats"
          onClick={onClose}
        >
          &times;
        </button>

        <h2 className="ms-title">Service record</h2>

        {failed && (
          <p className="ms-status">
            Couldn&rsquo;t load your stats. Close this and try again.
          </p>
        )}
        {!failed && profile === null && <p className="ms-status">Loading&hellip;</p>}

        {profile !== null && stats !== undefined && (
          <>
            <div className="ms-identity">
              <span className="ms-callsign">{profile.username}</span>
              <span className="ms-since">
                Enlisted {formatDate(profile.memberSince)}
              </span>
            </div>

            {stats.gamesPlayed === 0 ? (
              <p className="ms-empty">
                No battles on record yet. Win one and it shows up here.
              </p>
            ) : (
              <>
                <div className="ms-tiles">
                  <StatTile value={stats.totalPoints.toLocaleString()} label="Total points" loud />
                  <StatTile value={stats.bestScore.toLocaleString()} label="Best game" />
                  <StatTile value={`${winRate}%`} label="Win rate" />
                  <StatTile value={`${stats.accuracy}%`} label="Accuracy" />
                </div>

                <section className="ms-section">
                  <h3>Combat log</h3>
                  <dl className="ms-rows">
                    <div className="ms-row">
                      <dt>Battles fought</dt>
                      <dd>{stats.gamesPlayed}</dd>
                    </div>
                    <div className="ms-row">
                      <dt>Victories</dt>
                      <dd>{stats.gamesWon}</dd>
                    </div>
                    <div className="ms-row">
                      <dt>Ships sunk</dt>
                      <dd>{stats.totalShipsSunk}</dd>
                    </div>
                    <div className="ms-row">
                      <dt>Shots landed</dt>
                      <dd>
                        {stats.totalHits} / {stats.totalHits + stats.totalMisses}
                      </dd>
                    </div>
                    <div className="ms-row">
                      <dt>Current streak</dt>
                      <dd>{stats.currentWinStreak}</dd>
                    </div>
                    <div className="ms-row">
                      <dt>Best streak</dt>
                      <dd>{stats.bestWinStreak}</dd>
                    </div>
                  </dl>
                </section>

                <section className="ms-section">
                  <h3>Bot record</h3>
                  <div className="ms-bots">
                    {(["easy", "medium", "hard"] as const).map((level) => (
                      <div key={level} className="ms-bot">
                        <span className="ms-bot-level">{level}</span>
                        <span className="ms-bot-record">
                          {profile.stats.bots[level].won}&ndash;
                          {profile.stats.bots[level].played -
                            profile.stats.bots[level].won}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {profile.recentGames.length > 0 && (
                  <section className="ms-section">
                    <h3>Recent battles</h3>
                    <ul className="ms-recent">
                      {profile.recentGames.map((game, i) => (
                        <li
                          key={i}
                          className={game.won ? "ms-game won" : "ms-game lost"}
                        >
                          <span className="ms-game-result">
                            {game.won ? "Win" : "Loss"}
                          </span>
                          <span className="ms-game-mode">
                            {MODE_LABELS[game.mode]}
                          </span>
                          <span className="ms-game-score">
                            {game.score.toLocaleString()}
                          </span>
                          <span className="ms-game-date">
                            {formatDate(game.date)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
