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

function readThemeToken(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
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

  uniform float uTime;
  uniform float uWind;
  uniform vec2 uMouse;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    float radius = length(pos.xy);
    float wave = sin(uTime * 1.7 + radius * 4.8) * 0.12;
    vec2 wind = normalize(pos.xy + vec2(0.001)) * uWind * (0.3 + smoothstep(0.0, 1.6, radius));
    wind += uMouse * 0.2;
    pos.xy += wind;
    pos.z += wave;

    vAlpha = 0.22 + 0.78 * (1.0 - smoothstep(0.0, 1.7, radius));
    vColor = color;
    gl_PointSize = 2.75 + 3.0 * vAlpha;
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

function SandField({ count = 11000, theme }: { count?: number; theme: ThemeTokens }) {
  const pointsRef = useRef<THREE.Points>(null);
  const [wind, setWind] = useState(0);
  const mouse = useRef(new THREE.Vector2(0, 0));

  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = Math.sqrt(Math.random()) * 1.8;
      const theta = Math.random() * Math.PI * 2;
      array[i * 3] = Math.cos(theta) * radius;
      array[i * 3 + 1] = Math.sin(theta) * radius;
      array[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
    }
    return array;
  }, [count]);

  const colors = useMemo(() => {
    const array = new Float32Array(count * 3);
    const baseDark = new THREE.Color(theme.sandBase);
    const highlight = new THREE.Color(theme.sandHighlight);
    const accent = new THREE.Color(theme.sandAccent);

    for (let i = 0; i < count; i += 1) {
      const mix = Math.random();
      const color = baseDark.clone().lerp(mix > 0.6 ? highlight : accent, 0.35 + 0.65 * Math.random());
      array[i * 3] = color.r;
      array[i * 3 + 1] = color.g;
      array[i * 3 + 2] = color.b;
    }

    return array;
  }, [count, theme]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      mouse.current.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * -2 + 1
      );
    };

    const handleScroll = () => {
      const scrollY = window.scrollY / Math.max(window.innerHeight, 1);
      setWind(Math.min(1.6, scrollY * 2.5));
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      name: "SandMaterial",
      glslVersion: THREE.GLSL1,
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: sandVertexShader,
      fragmentShader: sandFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const material = pointsRef.current.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uWind.value = wind;
    material.uniforms.uMouse.value = mouse.current;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
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
    <group position={[0, 0.2, 0]}>
      <mesh ref={ref}>
        <torusKnotGeometry args={[0.65, 0.18, 160, 24]} />
        <meshStandardMaterial color={theme.sigilMetal} metalness={0.92} roughness={0.16} emissive={theme.sigilEmissive} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

export default function ThresholdScene() {
  const theme = useThemeTokens();

  return (
    <div className="relative h-screen w-full">
      <Canvas
        shadows={false}
        camera={{ position: [0, 0, 4.5], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        className="h-full w-full"
      >
        <color attach="background" args={[theme.backgroundDark]} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[3, 2, 4]} intensity={1.1} />
        <pointLight position={[-3, -1.5, -2]} intensity={0.8} color={theme.sandHighlight} />
        <SandField theme={theme} />
        <SigilArtifact theme={theme} />
      </Canvas>
      <div className="threshold-scene-banner pointer-events-none absolute inset-x-0 top-12 mx-auto flex max-w-6xl justify-between px-6 sm:px-8">
        <span className="text-xs uppercase tracking-[0.4em]">SPL393</span>
      </div>
    </div>
  );
}
