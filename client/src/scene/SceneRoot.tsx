import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, Stats } from "@react-three/drei";
import { useState, type ReactNode } from "react";
import { Ocean } from "./Ocean";
import { SkyDome } from "./SkyDome";

// Root of the 3D scene: everything later Phase 4 plans (grid, ships,
// camera rig) mounts inside this <Canvas>. Ocean + SkyDome are the shared
// environment; PerformanceMonitor/Stats give the perf baseline every
// subsequent plan compares against. `children` lets callers (e.g. the dev
// sandbox, later real screens) compose additional scene content inside the
// same Canvas without duplicating the environment setup.
export function SceneRoot({ children }: { children?: ReactNode }) {
  const [dpr, setDpr] = useState(1.5);

  return (
    // Without an explicit lookAt the default camera stares straight at the
    // horizon (identity rotation), so surface-level content in front of it
    // reads as sunken beneath the far waterline. Tilt down at the water
    // around the origin, where scene content (ships, later the grid) sits.
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 20, 52], fov: 50 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.5)}
      />
      {import.meta.env.DEV && <Stats />}
      <SkyDome />
      <Ocean />
      {children}
    </Canvas>
  );
}
