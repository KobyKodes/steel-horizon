import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, Stats } from "@react-three/drei";
import { useState } from "react";
import { Ocean } from "./Ocean";
import { SkyDome } from "./SkyDome";

// Root of the 3D scene: everything later Phase 4 plans (grid, ships,
// camera rig) mounts inside this <Canvas>. Ocean + SkyDome are the shared
// environment; PerformanceMonitor/Stats give the perf baseline every
// subsequent plan compares against.
export function SceneRoot() {
  const [dpr, setDpr] = useState(1.5);

  return (
    <Canvas dpr={dpr} camera={{ position: [0, 9, 55], fov: 50 }}>
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.5)}
      />
      {import.meta.env.DEV && <Stats />}
      <SkyDome />
      <Ocean />
    </Canvas>
  );
}
