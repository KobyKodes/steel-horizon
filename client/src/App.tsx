// Phase router — snapshot.phase IS the routing (no router library, no
// client-side transition logic). The server changes the phase; we follow.
// One exception (USER request): gameover holds on the battle screen so the
// final sink cinematic + victory banner play out; the banner's button
// advances to the post-game screen.

import { useEffect, useState } from "react";
import { useGameStore } from "./store";
import AuthScreen from "./screens/AuthScreen";
import LandingScreen from "./screens/LandingScreen";
import LobbyScreen from "./screens/LobbyScreen";
import PlacementScreen from "./screens/PlacementScreen";
import BattleScreen from "./screens/BattleScreen";
import PostGameScreen from "./screens/PostGameScreen";

function StatusBar() {
  const snapshot = useGameStore((s) => s.snapshot);
  const connection = useGameStore((s) => s.connection);

  const showBar = snapshot !== null || connection === "disconnected";
  if (!showBar) return null;

  return (
    <div className="status-bar">
      {snapshot && <span className="room-code">{snapshot.code}</span>}
      {snapshot && <span>{snapshot.you.name}</span>}
      {snapshot?.opponent && !snapshot.opponent.connected && (
        <span className="warn">Opponent disconnected — reconnecting&hellip;</span>
      )}
      {connection === "disconnected" && (
        <span className="warn">Disconnected, reconnecting&hellip;</span>
      )}
    </div>
  );
}

export default function App() {
  const snapshot = useGameStore((s) => s.snapshot);
  const authUser = useGameStore((s) => s.authUser);
  const authChecked = useGameStore((s) => s.authChecked);
  const phase = snapshot?.phase;

  // Battle lingers through gameover until the player advances; a rematch
  // (phase leaves gameover) re-arms the hold for the next game.
  const [resultsShown, setResultsShown] = useState(false);
  useEffect(() => {
    if (phase !== "gameover") setResultsShown(false);
  }, [phase]);

  // Account gate: hold blank until the boot-time token check settles (so a
  // signed-in returnee never flashes the auth screen), then require login.
  if (!authChecked) return null;
  if (authUser === null) return <AuthScreen />;

  let screen;
  if (snapshot === null) {
    screen = <LandingScreen />;
  } else if (snapshot.phase === "lobby") {
    screen = <LobbyScreen snapshot={snapshot} />;
  } else if (snapshot.phase === "placement") {
    screen = <PlacementScreen />;
  } else if (
    snapshot.phase === "battle" ||
    (snapshot.phase === "gameover" && !resultsShown)
  ) {
    screen = <BattleScreen onShowResults={() => setResultsShown(true)} />;
  } else {
    screen = <PostGameScreen />;
  }

  return (
    <>
      <StatusBar />
      {screen}
    </>
  );
}
