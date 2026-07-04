import { SceneRoot } from "../scene/SceneRoot";

// Standalone full-viewport harness for isolated visual verification of the
// 3D scene across plans 04-01 through 04-05. Reached via /?dev=scene.
// Removed once the scene is wired into the real screens (plan 04-06).
export function SceneSandbox() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <SceneRoot />
    </div>
  );
}
