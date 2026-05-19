"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

type ThemeTokens = {
  backgroundDark: string;
  sandBase: string;
  sandHighlight: string;
  sandAccent: string;
  sigilMetal: string;
  sigilEmissive: string;
  sigilText: string;
  textMuted: string;
};

type ParticleData = {
  basePositions: Float32Array;
  colors: Float32Array;
  count: number;
  phases: Float32Array;
  positions: Float32Array;
  scatterOffsets: Float32Array;
  speedFactors: Float32Array;
  themeKey: string;
  velocities: Float32Array;
};

type SampledArtwork = {
  colors: Float32Array;
  luminance: Float32Array;
  sourceKey: string;
};

const ARTWORK_IMAGE_URL = "/Gustave_Courbet_-_Le_D%C3%A9sesp%C3%A9r%C3%A9_(1843).jpg";
const PARTICLE_COUNT = 28600;
const ARTWORK_WIDTH = 8.2;
const ARTWORK_HEIGHT = 4.8;
const PARTICLE_MAX_XY_SPEED = 0.16;
const PARTICLE_MAX_Z_SPEED = 0.045;
const CURSOR_INFLUENCE_RADIUS = 0.46;
const CURSOR_CARVE_STRENGTH = 1.25;
const CURSOR_DRAG_STRENGTH = 0.045;
const RIPPLE_COUNT = 7;
const RIPPLE_DURATION = 1.4;
const RIPPLE_SPEED = 1.35;
const RIPPLE_WIDTH = 0.16;
const RIPPLE_STRENGTH = 0.018;

function readThemeToken(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function randomUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function sampleFallbackColor(seed: number, theme: ThemeTokens) {
  const baseDark = new THREE.Color(theme.sandBase);
  const highlight = new THREE.Color(theme.sandHighlight);
  const accent = new THREE.Color(theme.sandAccent);
  const mix = randomUnit(seed);
  return baseDark
    .clone()
    .lerp(mix > 0.62 ? highlight : accent, 0.25 + 0.55 * randomUnit(seed + 1000));
}

function createParticleData(
  count: number,
  theme: ThemeTokens,
  themeKey: string,
  sampledArtwork: SampledArtwork | null
): ParticleData {
  const basePositions = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);
  const scatterOffsets = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const speedFactors = new Float32Array(count);
  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const sourceKey = sampledArtwork?.sourceKey ?? "fallback";

  for (let i = 0; i < count; i += 1) {
    const baseSeed = i + 1;
    const sampleIndex = sampledArtwork ? i % sampledArtwork.luminance.length : i;
    const columnCount = Math.ceil(Math.sqrt(count * (ARTWORK_WIDTH / ARTWORK_HEIGHT)));
    const rowCount = Math.ceil(count / columnCount);
    const xCell = i % columnCount;
    const yCell = Math.floor(i / columnCount);
    const jitterX = (randomUnit(baseSeed + 10000) - 0.5) * (ARTWORK_WIDTH / columnCount) * 0.85;
    const jitterY = (randomUnit(baseSeed + 20000) - 0.5) * (ARTWORK_HEIGHT / rowCount) * 0.85;
    const x = ((xCell + 0.5) / columnCount - 0.5) * ARTWORK_WIDTH + jitterX;
    const y = (0.5 - (yCell + 0.5) / rowCount) * ARTWORK_HEIGHT + jitterY;
    const luminance = sampledArtwork?.luminance[sampleIndex] ?? randomUnit(baseSeed + 30000);
    const z = (luminance - 0.5) * 0.72 + (randomUnit(baseSeed + 40000) - 0.5) * 0.18;
    const idx = i * 3;

    basePositions[idx] = x;
    basePositions[idx + 1] = y;
    basePositions[idx + 2] = z;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;

    const scatterAngle = randomUnit(baseSeed + 50000) * Math.PI * 2;
    const scatterDistance = 1.4 + randomUnit(baseSeed + 60000) * 3.8;
    scatterOffsets[idx] = Math.cos(scatterAngle) * scatterDistance - 3.2;
    scatterOffsets[idx + 1] = Math.sin(scatterAngle) * scatterDistance * 0.62;
    scatterOffsets[idx + 2] = (randomUnit(baseSeed + 70000) - 0.5) * 1.6 + 0.45;

    speedFactors[i] = 0.45 + randomUnit(baseSeed + 110000) * 0.75;
    phases[i] = randomUnit(baseSeed + 120000) * Math.PI * 2;

    const color = sampledArtwork
      ? new THREE.Color(
          sampledArtwork.colors[sampleIndex * 3],
          sampledArtwork.colors[sampleIndex * 3 + 1],
          sampledArtwork.colors[sampleIndex * 3 + 2]
        )
      : sampleFallbackColor(baseSeed + 130000, theme);
    colors[idx] = color.r;
    colors[idx + 1] = color.g;
    colors[idx + 2] = color.b;
  }

  return {
    basePositions,
    colors,
    count,
    phases,
    positions,
    scatterOffsets,
    speedFactors,
    themeKey: `${themeKey}|${sourceKey}`,
    velocities,
  };
}

function sampleArtworkImage(image: HTMLImageElement, count: number, theme: ThemeTokens): SampledArtwork {
  const columnCount = Math.ceil(Math.sqrt(count * (ARTWORK_WIDTH / ARTWORK_HEIGHT)));
  const rowCount = Math.ceil(count / columnCount);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = columnCount;
  canvas.height = rowCount;

  if (!context) {
    throw new Error("Unable to sample artwork image.");
  }

  context.drawImage(image, 0, 0, columnCount, rowCount);
  const pixels = context.getImageData(0, 0, columnCount, rowCount).data;
  const colors = new Float32Array(count * 3);
  const luminance = new Float32Array(count);
  const nigredo = new THREE.Color(theme.backgroundDark);
  const sulfur = new THREE.Color(theme.sandHighlight);
  const coral = new THREE.Color(theme.sandAccent);

  for (let i = 0; i < count; i += 1) {
    const pixelIndex = i * 4;
    const red = pixels[pixelIndex] / 255;
    const green = pixels[pixelIndex + 1] / 255;
    const blue = pixels[pixelIndex + 2] / 255;
    const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
    const warmth = Math.max(0, red - blue);
    const color = nigredo
      .clone()
      .lerp(warmth > 0.18 ? coral : sulfur, 0.12 + brightness * 0.72);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    luminance[i] = brightness;
  }

  return {
    colors,
    luminance,
    sourceKey: `${ARTWORK_IMAGE_URL}|${columnCount}x${rowCount}`,
  };
}

function useThemeTokens(): ThemeTokens {
  return useMemo(
    () => ({
      backgroundDark: readThemeToken("--background-dark", "#040404"),
      sandBase: readThemeToken("--color-sand-base", "#0f0f10"),
      sandHighlight: readThemeToken("--color-sand-highlight", "#ffb66c"),
      sandAccent: readThemeToken("--color-sand-accent", "#ff7f5d"),
      sigilMetal: readThemeToken("--color-sigil-metal", "#d5b96e"),
      sigilEmissive: readThemeToken("--color-sigil-emissive", "#3d2200"),
      sigilText: readThemeToken("--color-sigil-text", "#f4e9a3"),
      textMuted: readThemeToken("--color-foreground-muted", "rgba(255,255,255,0.72)"),
    }),
    []
  );
}

const sandVertexShader = `
  precision highp float;
  precision highp int;

  uniform float uWind;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    float radius = length(pos.xy);
    vec2 wind = normalize(pos.xy + vec2(0.001)) * uWind * (0.3 + smoothstep(0.0, 1.6, radius));
    pos.xy += wind;

    vAlpha = 0.58 + 0.42 * (1.0 - smoothstep(0.0, 3.4, radius));
    vColor = color + vec3(0.65, 0.32, 0.08) * uWind;
    gl_PointSize = 2.05 + 2.35 * vAlpha + uWind * 1.4;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const sandFragmentShader = `
  precision mediump float;
  precision mediump int;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    float shape = smoothstep(0.55, 0.0, dist);
    gl_FragColor = vec4(vColor, shape * vAlpha);
  }
`;

function SandField({
  count = PARTICLE_COUNT,
  revealed,
  theme,
}: {
  count?: number;
  revealed: boolean;
  theme: ThemeTokens;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const [sampledArtwork, setSampledArtwork] = useState<SampledArtwork | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const scatterProgressRef = useRef(0);
  const pointerRef = useRef({
    active: false,
    lastRippleTime: -Infinity,
    velocityX: 0,
    velocityY: 0,
    x: 0,
    y: 0,
  });
  const ripplesRef = useRef(
    Array.from({ length: RIPPLE_COUNT }, () => ({
      active: false,
      startTime: 0,
      x: 0,
      y: 0,
    }))
  );
  const rippleIndexRef = useRef(0);
  const themeKey = `${theme.sandBase}|${theme.sandHighlight}|${theme.sandAccent}`;
  const particleData = useMemo(
    () => createParticleData(count, theme, themeKey, sampledArtwork),
    [count, sampledArtwork, theme, themeKey]
  );
  const positionsRef = useRef<Float32Array | null>(null);
  const targetPositionsRef = useRef<Float32Array | null>(null);
  const velocitiesRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    let isMounted = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!isMounted) return;
      try {
        setSampledArtwork(sampleArtworkImage(image, count, theme));
      } catch {
        setSampledArtwork(null);
      }
    };
    image.onerror = () => {
      if (isMounted) setSampledArtwork(null);
    };
    image.src = ARTWORK_IMAGE_URL;

    return () => {
      isMounted = false;
    };
  }, [count, theme]);

  useEffect(() => {
    positionsRef.current = particleData.positions.slice();
    targetPositionsRef.current = particleData.basePositions.slice();
    velocitiesRef.current = particleData.velocities.slice();

    const positionAttribute = geometryRef.current?.getAttribute("position") as
      | THREE.BufferAttribute
      | undefined;
    if (positionAttribute) {
      positionAttribute.copyArray(positionsRef.current);
      positionAttribute.setUsage(THREE.DynamicDrawUsage);
      positionAttribute.needsUpdate = true;
    }
  }, [particleData]);

  useEffect(() => {
    if (geometryRef.current) {
      const positionAttribute = geometryRef.current.attributes.position as THREE.BufferAttribute;
      positionAttribute.setUsage(THREE.DynamicDrawUsage);
    }
  }, []);

  const addRipple = (x: number, y: number, time: number) => {
    const ripples = ripplesRef.current;
    const index = rippleIndexRef.current;
    ripples[index] = {
      active: true,
      startTime: time,
      x,
      y,
    };
    rippleIndexRef.current = (index + 1) % RIPPLE_COUNT;
  };

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      name: "SandMaterial",
      glslVersion: THREE.GLSL1,
      uniforms: {
        uWind: { value: 0 },
      },
      vertexShader: sandVertexShader,
      fragmentShader: sandFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
  }, []);

  useFrame(({ camera, clock, pointer, viewport }, delta) => {
    const mutablePositions = positionsRef.current;
    const mutableTargets = targetPositionsRef.current;
    const mutableVelocities = velocitiesRef.current;
    if (!pointsRef.current || !mutablePositions || !mutableTargets || !mutableVelocities) return;
    const material = pointsRef.current.material as THREE.ShaderMaterial;

    const geometry =
      geometryRef.current || (pointsRef.current.geometry as THREE.BufferGeometry);
    const positionsAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    if (positionsAttr.usage !== THREE.DynamicDrawUsage) {
      positionsAttr.setUsage(THREE.DynamicDrawUsage);
    }
    const dt = Math.min(0.05, delta);
    const time = clock.elapsedTime;
    const view = viewport.getCurrentViewport(camera, [0, 0, 0]);
    const pointerState = pointerRef.current;
    const pointerX = pointer.x * view.width * 0.5;
    const pointerY = pointer.y * view.height * 0.5;
    const pointerStartX = pointerState.x;
    const pointerStartY = pointerState.y;
    const pointerWasActive = pointerState.active;
    const pointerDistance = Math.hypot(pointerX - pointerStartX, pointerY - pointerStartY);
    const pointerMoved = pointerDistance > 0.001;
    pointerState.active = pointerMoved || pointerWasActive;
    const pointerDirectionX = pointerDistance > 0 ? (pointerX - pointerStartX) / pointerDistance : 0;
    const pointerDirectionY = pointerDistance > 0 ? (pointerY - pointerStartY) / pointerDistance : 0;

    if (pointerState.active && pointerWasActive && pointerMoved && dt > 0) {
      pointerState.velocityX = (pointerX - pointerStartX) / dt;
      pointerState.velocityY = (pointerY - pointerStartY) / dt;

      if (revealed && pointerDistance > 0.08 && time - pointerState.lastRippleTime > 0.08) {
        addRipple(pointerX, pointerY, time);
        pointerState.lastRippleTime = time;
      }
    } else {
      pointerState.velocityX = 0;
      pointerState.velocityY = 0;
    }

    pointerState.x = pointerX;
    pointerState.y = pointerY;
    const scatterTarget = revealed ? 1 : 0;
    scatterProgressRef.current = THREE.MathUtils.damp(
      scatterProgressRef.current,
      scatterTarget,
      revealed ? 2.8 : 1.2,
      dt
    );
    const scatterProgress = scatterProgressRef.current;
    material.uniforms.uWind.value = scatterProgress * 0.28;

    for (let i = 0; i < count; i += 1) {
      const idx = i * 3;
      let px = mutablePositions[idx];
      let py = mutablePositions[idx + 1];
      let pz = mutablePositions[idx + 2];
      let vx = mutableVelocities[idx];
      let vy = mutableVelocities[idx + 1];
      let vz = mutableVelocities[idx + 2];
      const phase = particleData.phases[i];
      const particleSpeed = particleData.speedFactors[i];
      const targetX = mutableTargets[idx] + particleData.scatterOffsets[idx] * scatterProgress;
      const targetY = mutableTargets[idx + 1] + particleData.scatterOffsets[idx + 1] * scatterProgress;
      const targetZ = mutableTargets[idx + 2] + particleData.scatterOffsets[idx + 2] * scatterProgress;

      vx += (targetX - px) * (0.32 + scatterProgress * 0.35) * dt;
      vy += (targetY - py) * (0.32 + scatterProgress * 0.35) * dt;
      vz += (targetZ - pz) * (0.28 + scatterProgress * 0.24) * dt;
      vx += Math.cos(phase * 1.9 + time * 0.9) * 0.004 * particleSpeed * scatterProgress;
      vy += Math.sin(phase * 2.2 + time * 0.95) * 0.004 * particleSpeed * scatterProgress;
      vz += Math.sin(phase * 1.4 + time * 0.55) * 0.0018 * particleSpeed * scatterProgress;

      if (pointerState.active && pointerWasActive && pointerMoved) {
        const segmentProgress =
          pointerDistance > 0
            ? THREE.MathUtils.clamp(
                ((px - pointerStartX) * (pointerX - pointerStartX) +
                  (py - pointerStartY) * (pointerY - pointerStartY)) /
                  (pointerDistance * pointerDistance),
                0,
                1
              )
            : 0;
        const closestX = pointerStartX + (pointerX - pointerStartX) * segmentProgress;
        const closestY = pointerStartY + (pointerY - pointerStartY) * segmentProgress;
        const pointerDx = px - closestX;
        const pointerDy = py - closestY;
        const pointerDist = Math.hypot(pointerDx, pointerDy);

        if (pointerDist < CURSOR_INFLUENCE_RADIUS) {
          const influence = 1.0 - pointerDist / CURSOR_INFLUENCE_RADIUS;
          const carve = influence * influence * CURSOR_CARVE_STRENGTH;
          const directionX = pointerDist > 0.001 ? pointerDx / pointerDist : 0;
          const directionY = pointerDist > 0.001 ? pointerDy / pointerDist : 0;
          const carveX = directionX * carve * dt;
          const carveY = directionY * carve * dt;
          const dragDistance = CURSOR_DRAG_STRENGTH * influence;
          const dragX = pointerDirectionX * dragDistance;
          const dragY = pointerDirectionY * dragDistance;

          vx += carveX;
          vy += carveY;
          vx += dragX;
          vy += dragY;
          mutableTargets[idx] += carveX * 0.42 + dragX * 0.18;
          mutableTargets[idx + 1] += carveY * 0.42 + dragY * 0.18;
          mutableTargets[idx + 2] += influence * Math.sin(time * 10.0 + phase) * 0.012;
          pz += influence * Math.sin(time * 10.0 + phase) * 0.04;
        }
      }

      for (const ripple of ripplesRef.current) {
        if (!ripple.active) continue;
        const rippleAge = time - ripple.startTime;
        if (rippleAge < 0 || rippleAge > RIPPLE_DURATION) {
          ripple.active = false;
          continue;
        }

        const rippleDx = px - ripple.x;
        const rippleDy = py - ripple.y;
        const rippleDist = Math.hypot(rippleDx, rippleDy);
        const ringRadius = rippleAge * RIPPLE_SPEED;
        const ringDistance = Math.abs(rippleDist - ringRadius);

        if (ringDistance < RIPPLE_WIDTH && rippleDist > 0.001) {
          const fade = 1.0 - rippleAge / RIPPLE_DURATION;
          const ring = 1.0 - ringDistance / RIPPLE_WIDTH;
          const push = ring * ring * fade * RIPPLE_STRENGTH;
          vx += (rippleDx / rippleDist) * push;
          vy += (rippleDy / rippleDist) * push;
          pz += Math.sin((1.0 - ringDistance / RIPPLE_WIDTH) * Math.PI) * push * 2.0;
        }
      }

      const xySpeed = Math.hypot(vx, vy);
      if (xySpeed > PARTICLE_MAX_XY_SPEED) {
        const speedLimit = PARTICLE_MAX_XY_SPEED / xySpeed;
        vx *= speedLimit;
        vy *= speedLimit;
      }
      vz = THREE.MathUtils.clamp(vz, -PARTICLE_MAX_Z_SPEED, PARTICLE_MAX_Z_SPEED);

      px += vx * dt * 9.5 * particleSpeed;
      py += vy * dt * 9.5 * particleSpeed;
      pz += vz * dt * 5.5 * particleSpeed;

      if (pz > 1.1) {
        pz = 1.1;
        vz = -Math.abs(vz);
      } else if (pz < -1.1) {
        pz = -1.1;
        vz = Math.abs(vz);
      }
      mutableVelocities[idx] = vx * 0.965;
      mutableVelocities[idx + 1] = vy * 0.965;
      mutableVelocities[idx + 2] = vz * 0.94;
      mutablePositions[idx] = px;
      mutablePositions[idx + 1] = py;
      mutablePositions[idx + 2] = pz;
      positionsAttr.setXYZ(i, px, py, pz);
    }

    positionsAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[particleData.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[particleData.colors, 3]} />
      </bufferGeometry>
      <primitive object={material} attach="material" />
    </points>
  );
}

function SigilArtifact({ theme }: { theme: ThemeTokens }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.08;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.1) * 0.05;
  });

  return (
    <group position={[0, 0.05, -0.45]} scale={1.18}>
      <mesh ref={ref}>
        <torusKnotGeometry args={[0.65, 0.18, 160, 24]} />
        <meshStandardMaterial color={theme.sigilMetal} metalness={0.92} roughness={0.16} emissive={theme.sigilEmissive} emissiveIntensity={0.25} />
      </mesh>
      <Text
        position={[0, 0, 0.62]}
        fontSize={0.18}
        letterSpacing={0.32}
        anchorX="center"
        anchorY="middle"
      >
        SPL393
        <meshStandardMaterial color={theme.backgroundDark} metalness={0.2} roughness={0.62} />
      </Text>
    </group>
  );
}

export default function ThresholdScene() {
  const theme = useThemeTokens();
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative h-screen w-full">
      <Canvas
        shadows={false}
        camera={{ position: [0, 0, 6], fov: 48 }}
        gl={{ antialias: true, alpha: true }}
        className="h-full w-full"
        onPointerDown={() => setRevealed(true)}
      >
        <color attach="background" args={[theme.backgroundDark]} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[3, 2, 4]} intensity={1.1} />
        <pointLight position={[-3, -1.5, -2]} intensity={0.8} color={theme.sandHighlight} />
        {revealed ? <SigilArtifact theme={theme} /> : null}
        <SandField revealed={revealed} theme={theme} />
      </Canvas>
      <div className="threshold-scene-banner pointer-events-none absolute inset-x-0 top-12 mx-auto flex max-w-6xl justify-between px-6 sm:px-8">
        <span className="text-xs uppercase tracking-[0.4em]">SPL393</span>
      </div>
    </div>
  );
}
