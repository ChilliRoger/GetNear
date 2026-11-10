"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface NearToken3DProps {
  className?: string;
  modelUrl?: string;
}

function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
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

    // Fast-fail if browser has disabled or blocked WebGL
    if (!isWebGLAvailable()) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    let animationFrameId: number;
    let isDisposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      // 1. Scene setup
      const scene = new THREE.Scene();

      const width = container.clientWidth || 400;
      const height = container.clientHeight || 400;

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 0, 5);

      // 2. WebGL Renderer with graceful error handling
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "default",
          failIfMajorPerformanceCaveat: false,
        });
      } catch (renderInitErr) {
        console.warn("[NearToken3D] WebGLRenderer creation blocked:", renderInitErr);
        setIsLoading(false);
        setHasError(true);
        return;
      }

      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      // Handle context lost & restore gracefully
      const handleContextLost = (e: Event) => {
        e.preventDefault();
        cancelAnimationFrame(animationFrameId);
        setIsLoading(false);
        setHasError(true);
      };
      renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);

      // 3. Lighting setup tailored for NEAR metallic shader
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0x00ec97, 3.0);
      keyLight.position.set(3, 4, 4);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 1.8);
      fillLight.position.set(-3, -2, 3);
      scene.add(fillLight);

      const rimLight = new THREE.PointLight(0x00ec97, 2.5, 15);
      rimLight.position.set(0, 5, 2);
      scene.add(rimLight);

      // 4. OrbitControls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
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
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());

          model.position.x = -center.x;
          model.position.y = -center.y;
          model.position.z = -center.z;

          const maxDim = Math.max(size.x, size.y, size.z);
          const targetScale = 2.4 / (maxDim || 1);
          modelGroup.scale.setScalar(targetScale);
          modelGroup.add(model);

          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              if (
                mesh.material &&
                (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial
              ) {
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
          console.warn("[NearToken3D] GLTF load error:", error);
          if (!isDisposed) {
            setIsLoading(false);
            setHasError(true);
          }
        }
      );

      // 6. Resize handling
      const handleResize = () => {
        if (!container || !renderer) return;
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        if (newWidth === 0 || newHeight === 0) return;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      };

      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      // 7. Render Loop
      const clock = new THREE.Clock();
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();
        modelGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.08;

        if (controls) controls.update();
        if (renderer) renderer.render(scene, camera);
      };

      animate();

      // 8. Cleanup
      return () => {
        isDisposed = true;
        cancelAnimationFrame(animationFrameId);
        if (resizeObserver) resizeObserver.disconnect();
        if (controls) controls.dispose();

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

        if (renderer) {
          renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
          renderer.dispose();
          if (renderer.domElement.parentElement) {
            renderer.domElement.parentElement.removeChild(renderer.domElement);
          }
        }
      };
    } catch (err) {
      console.warn("[NearToken3D] Initialization failed:", err);
      setIsLoading(false);
      setHasError(true);
    }
  }, [modelUrl]);

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        className={`w-full h-[400px] sm:h-[450px] max-w-[480px] cursor-grab active:cursor-grabbing flex items-center justify-center ${
          hasError ? "hidden" : ""
        }`}
      />

      {/* Loading State Skeleton */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-12 h-12 rounded-full border-2 border-[#00ec97] border-t-transparent animate-spin" />
          <span className="text-xs font-mono text-zinc-400">Loading 3D Token...</span>
        </div>
      )}

      {/* Fallback Static Emblem when WebGL is blocked or unavailable */}
      {hasError && (
        <div className="flex flex-col items-center justify-center gap-3.5 py-8">
          <div className="relative w-48 h-48 rounded-full bg-[#0c0e13] border border-[#222634] flex items-center justify-center shadow-2xl">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-24 h-24 text-[#00ec97] stroke-current stroke-[2.2]"
            >
              <path d="M4 19V5l12 14V5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-xs font-mono text-zinc-400 font-semibold tracking-wider">
            NEAR Protocol
          </span>
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
