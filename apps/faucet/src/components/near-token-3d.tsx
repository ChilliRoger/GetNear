"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface NearToken3DProps {
  className?: string;
  modelUrl?: string;
}

export function NearToken3D({
  className = "",
  modelUrl = "/near3d_logo.glb",
}: NearToken3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId: number;
    let isDisposed = false;

    // 1. Scene setup
    const scene = new THREE.Scene();

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5);

    // 2. WebGL Renderer with alpha transparency
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 3. Lighting setup tailored for metallic NEAR branding
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    // Primary Emerald Key Light
    const keyLight = new THREE.DirectionalLight(0x00ec97, 3.0);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    // Secondary White Fill Light
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.8);
    fillLight.position.set(-3, -2, 3);
    scene.add(fillLight);

    // Top Rim Light
    const rimLight = new THREE.PointLight(0x00ec97, 2.5, 15);
    rimLight.position.set(0, 5, 2);
    scene.add(rimLight);

    // 4. OrbitControls for interactive mouse dragging
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false; // Prevent page scroll interference
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;

    // 5. Load 3D GLB Model
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (isDisposed) return;

        const model = gltf.scene;

        // Auto-center and normalize size
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Center model geometry
        model.position.x = -center.x;
        model.position.y = -center.y;
        model.position.z = -center.z;

        // Scale to fit viewport perfectly
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetScale = 2.4 / (maxDim || 1);
        modelGroup.scale.setScalar(targetScale);
        modelGroup.add(model);

        // Enhance materials
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.roughness = 0.35;
              mat.metalness = 0.7;
              mat.needsUpdate = true;
            }
          }
        });

        setIsLoading(false);
      },
      undefined,
      (error) => {
        console.error("Error loading 3D model:", error);
        if (!isDisposed) {
          setIsLoading(false);
          setHasError(true);
        }
      }
    );

    // 6. Handle container resize
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 7. Render Loop with gentle floating animation
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Subtle float up and down
      modelGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.08;

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // 8. Cleanup
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();

      scene.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl]);

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-[400px] sm:h-[450px] max-w-[480px] cursor-grab active:cursor-grabbing flex items-center justify-center"
      />

      {/* Loading State Skeleton */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-12 h-12 rounded-full border-2 border-[#00ec97] border-t-transparent animate-spin" />
          <span className="text-xs font-mono text-zinc-400">Loading 3D Token...</span>
        </div>
      )}

      {/* Error State Fallback */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
          <span>Unable to display 3D model</span>
        </div>
      )}

      {/* Interactive Helper Hint */}
      {!isLoading && !hasError && (
        <div className="absolute bottom-2 text-[11px] text-zinc-500 font-mono tracking-wider pointer-events-none opacity-60">
          Rotate &bull; Drag to inspect
        </div>
      )}
    </div>
  );
}

