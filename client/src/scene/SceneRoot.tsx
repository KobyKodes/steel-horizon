import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, Stats } from "@react-three/drei";
import { useState, type ReactNode } from "react";
import { Ocean } from "./Ocean";
import { SkyDome } from "./SkyDome";
import { CameraRig, type CameraView } from "./camera/CameraRig";

// Root of the 3D scene: everything later Phase 4 plans (grid, ships,
// camera rig) mounts inside this <Canvas>. Ocean + SkyDome are the shared
// environment; PerformanceMonitor/Stats give the perf baseline every
// subsequent plan compares against. `children` lets callers (e.g. the dev
// sandbox, later real screens) compose additional scene content inside the
// same Canvas without duplicating the environment setup.
//
// Camera framing is fully owned by <CameraRig> (04-04) via the `view`
// prop — SceneRoot no longer hardcodes a static camera position/lookAt.
export function SceneRoot({
  view,
  children,
}: {
  view: CameraView;
  children?: ReactNode;
}) {
  const [dpr, setDpr] = useState(1.5);

  return (
    <Canvas dpr={dpr} camera={{ fov: 50 }}>
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.5)}
      />
      {import.meta.env.DEV && <Stats />}
      <CameraRig view={view} />
      <SkyDome />
      <Ocean />
      {children}
    </Canvas>
  );
}
