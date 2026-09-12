import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function CameraAndTunnel({ scrollProgress, mousePos }) {
  const tunnelMeshRef = useRef();

  // Create curved 3D trajectory using CatmullRomCurve3
  const { curve, tubeGeometry } = useMemo(() => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0.5, -40),
      new THREE.Vector3(-3, -0.5, -80),
      new THREE.Vector3(1, 0, -120),
      new THREE.Vector3(0, 0, -160),
    ];
    const catmullCurve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(catmullCurve, 64, 4, 16, false);
    return { curve: catmullCurve, tubeGeometry: geometry };
  }, []);

  // Smooth lerp state
  const currentTRef = useRef(0);
  const currentMouseRef = useRef({ x: 0, y: 0 });

  useFrame(({ camera }) => {
    // 1. Smoothly lerp camera position along tunnel curve driven by scroll
    const targetT = THREE.MathUtils.clamp(scrollProgress, 0, 0.99);
    currentTRef.current = THREE.MathUtils.lerp(currentTRef.current, targetT, 0.08);

    const pos = curve.getPointAt(currentTRef.current);
    const lookAtTarget = curve.getPointAt(Math.min(currentTRef.current + 0.02, 1));

    camera.position.copy(pos);
    camera.lookAt(lookAtTarget);

    // 2. Layer mouse-look parallax on top of scroll lookAt target
    currentMouseRef.current.x = THREE.MathUtils.lerp(currentMouseRef.current.x, mousePos.current.x, 0.05);
    currentMouseRef.current.y = THREE.MathUtils.lerp(currentMouseRef.current.y, mousePos.current.y, 0.05);

    const maxAngle = 0.06; // ~3.4 degrees
    camera.rotation.y += currentMouseRef.current.x * maxAngle;
    camera.rotation.x += -currentMouseRef.current.y * maxAngle;
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 0, 0]} intensity={1.5} distance={30} color="#3051a8" />

      {/* Placeholder Tunnel Mesh (Dark material with wireframe/accents for depth reading) */}
      <mesh ref={tunnelMeshRef} geometry={tubeGeometry}>
        <meshStandardMaterial
          color="#141212"
          emissive="#0a0a14"
          side={THREE.BackSide}
          wireframe={false}
          roughness={0.8}
        />
      </mesh>

      {/* Guide rings along the tunnel path for depth perception */}
      {Array.from({ length: 12 }).map((_, i) => {
        const t = (i + 1) / 13;
        const ringPoint = curve.getPointAt(t);
        return (
          <mesh key={i} position={ringPoint}>
            <torusGeometry args={[3.9, 0.04, 8, 24]} />
            <meshBasicMaterial color="#3051a8" wireframe />
          </mesh>
        );
      })}
    </>
  );
}

export default function TunnelScene({ scrollProgress, mousePos }) {
  return (
    <div className="tunnel-canvas-wrapper" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas
        gl={{ pixelRatio: Math.min(window.devicePixelRatio, 2), antialias: true }}
        camera={{ fov: 60, near: 0.1, far: 300, position: [0, 0, 0] }}
      >
        <CameraAndTunnel scrollProgress={scrollProgress} mousePos={mousePos} />
      </Canvas>
    </div>
  );
}
