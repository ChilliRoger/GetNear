"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** True only if a WebGL context exists AND returns the pixel we just drew (Brave Shields etc. can block or garble it). */
function webglUsable(): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 4;
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return px[0] > 200 && px[1] < 60 && px[2] < 60;
  } catch {
    return false;
  }
}

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
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!webglUsable()) {
      setFallback(true);
      setIsLoading(false);
      return;
    }

    let animationFrameId: number;
    let isDisposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      // 1. Scene & Camera Setup
      const scene = new THREE.Scene();

      const width = container.clientWidth || 400;
      const height = container.clientHeight || 400;

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 0, 5);

      // 2. WebGL Renderer
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      // Handle context lost/restored to prevent browser blocking
      const handleContextLost = (e: Event) => {
        e.preventDefault();
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      };
      const handleContextRestored = () => {
        animate();
      };
      renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
      renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);

      // 3. Lighting setup tailored for metallic 3D NEAR token
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
      scene.add(ambientLight);

      // Emerald Key Light
      const keyLight = new THREE.DirectionalLight(0x22c55e, 3.2);
      keyLight.position.set(3, 4, 4);
      scene.add(keyLight);

      // Fill Light
      const fillLight = new THREE.DirectionalLight(0xffffff, 1.8);
      fillLight.position.set(-3, -2, 3);
      scene.add(fillLight);

      // Rim Point Light
      const rimLight = new THREE.PointLight(0x22c55e, 2.5, 15);
      rimLight.position.set(0, 5, 2);
      scene.add(rimLight);

      // 4. OrbitControls for interactive inspection
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false; // Prevent interfering with page scroll
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 2.0;

      // 5. Load 3D GLB Model (near3d_logo.glb)
      const modelGroup = new THREE.Group();
      scene.add(modelGroup);

      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          if (isDisposed) return;

          const model = gltf.scene;

          // Auto-center model geometry
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());

          model.position.x = -center.x;
          model.position.y = -center.y;
          model.position.z = -center.z;

          // Scale to fit viewport perfectly
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetScale = 2.4 / (maxDim || 1);
          modelGroup.scale.setScalar(targetScale);
          modelGroup.add(model);

          // Enhance 3D metallic materials
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
          console.error("[NearToken3D] Error loading 3D GLB model:", error);
          if (!isDisposed) {
            setIsLoading(false);
          }
        }
      );

      // 6. Resize Observer
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

      // 7. Render Loop with gentle floating animation
      const clock = new THREE.Clock();
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        // Subtle floating motion
        modelGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.08;

        if (controls) controls.update();
        if (renderer) renderer.render(scene, camera);
      };

      animate();

      // 8. Cleanup & Context Release
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
          renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
          renderer.dispose();
          // Release WebGL context so browser doesn't hit max-context limit
          try {
            renderer.forceContextLoss();
          } catch {}
          if (renderer.domElement.parentElement) {
            renderer.domElement.parentElement.removeChild(renderer.domElement);
          }
        }
      };
    } catch (err) {
      console.error("[NearToken3D] Initialization error:", err);
      setFallback(true);
      setIsLoading(false);
    }
  }, [modelUrl]);

  if (fallback) {
    return (
      <div className={`relative flex h-[340px] w-full max-w-[520px] items-center justify-center select-none sm:h-[440px] ${className}`} style={{ perspective: 900 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/near-logo.png" alt="NEAR logo" className="near-spin h-56 w-56 drop-shadow-[0_0_40px_rgba(34,197,94,0.45)] sm:h-72 sm:w-72" />
        <div className="pointer-events-none absolute bottom-2 text-[11px] text-muted opacity-70">3D needs WebGL: shown as a flat logo</div>
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        className="flex h-[340px] w-full max-w-[520px] cursor-grab items-center justify-center active:cursor-grabbing sm:h-[440px] [&>canvas]:![touch-action:pan-y]"
      />

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-12 h-12 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span className="text-xs text-muted">Loading 3D NEAR Token...</span>
        </div>
      )}

      {/* Interactive Drag & Rotate Helper Hint */}
      {!isLoading && (
        <div className="absolute bottom-2 text-[11px] text-muted pointer-events-none opacity-70">
          Drag to rotate
        </div>
      )}
    </div>
  );
}
