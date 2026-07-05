import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WAVES } from "./waves";

// GLSL mirror of waves.ts's gerstnerHeight — same constants (via uWaves
// uniforms), same formula. Keep these two in lockstep; see waves.ts's
// header comment.
const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec4 uWaves[3]; // dirX, dirZ, steepness, wavelength (un-normalized dir)

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vHeight;

  vec3 gerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
    float steepness = wave.z;
    float wavelength = wave.w;
    float k = 2.0 * 3.14159265 / wavelength;
    float c = sqrt(9.8 / k);
    vec2 d = normalize(wave.xy);
    float f = k * (dot(d, p.xz) - c * uTime);
    float a = steepness / k;

    tangent += vec3(
      -d.x * d.x * (steepness * sin(f)),
      d.x * (steepness * cos(f)),
      -d.x * d.y * (steepness * sin(f))
    );
    binormal += vec3(
      -d.x * d.y * (steepness * sin(f)),
      d.y * (steepness * cos(f)),
      -d.y * d.y * (steepness * sin(f))
    );
    return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
  }

  void main() {
    vec3 p = position;
    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 displaced = p;

    displaced += gerstnerWave(uWaves[0], p, tangent, binormal);
    displaced += gerstnerWave(uWaves[1], p, tangent, binormal);
    displaced += gerstnerWave(uWaves[2], p, tangent, binormal);

    vNormal = normalize(cross(binormal, tangent));
    vHeight = displaced.y;

    vec4 modelPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = modelPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * modelPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vHeight;

  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uGlowColor;

  void main() {
    // Single consistent shallow-water shade — no deep/shallow height mix
    // and no view-angle-driven fresnel darkening, both of which produced a
    // visible two-tone seam across the water (worst under the near-camera
    // holographic grid, where perspective foreshortening compresses any
    // angular falloff into a hard-looking line).
    vec3 base = uShallowColor;

    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0), 1.1);
    vec3 color = base + uGlowColor * fresnel * 0.3;

    gl_FragColor = vec4(color, 0.95);
  }
`;

function buildWaveUniform() {
  return WAVES.map(
    (w) => new THREE.Vector4(w.dirX, w.dirZ, w.steepness, w.wavelength),
  );
}

export function Ocean() {
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(400, 400, 200, 200),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uWaves: { value: buildWaveUniform() },
          uDeepColor: { value: new THREE.Color("#04607a") },
          uShallowColor: { value: new THREE.Color("#3fc1d6") },
          uGlowColor: { value: new THREE.Color("#bdf1ff") },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Drive uTime from the shared frame clock — NOT by accumulating delta.
  // FleetShips samples gerstnerHeight() with clock.elapsedTime; if the
  // shader accumulated its own time it would lag by however long passed
  // before the ocean's first frame, desyncing ships from the water.
  useFrame((state) => {
    material.uniforms.uTime!.value = state.clock.elapsedTime;
  });

  return (
    <mesh geometry={geometry} material={material} rotation-x={-Math.PI / 2} />
  );
}
