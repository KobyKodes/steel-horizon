import { Sky } from "@react-three/drei";

// Sun position tuned for a low, golden-hour naval "time-of-day" feel —
// low angle on the horizon for warm glare, paired with a matching
// directional light below.
const SUN_POSITION: [number, number, number] = [120, 8, -140];

export function SkyDome() {
  return (
    <>
      <Sky
        sunPosition={SUN_POSITION}
        turbidity={8}
        rayleigh={1.2}
        mieCoefficient={0.04}
        mieDirectionalG={0.9}
      />
      <fog attach="fog" args={["#7ba0ad", 80, 300]} />
      <ambientLight intensity={0.55} color="#a9d6e5" />
      <directionalLight
        position={SUN_POSITION}
        intensity={1.8}
        color="#ffdca8"
      />
    </>
  );
}
