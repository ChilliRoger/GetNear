"use client";

import React from "react";

export function NearEmblem({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Background Matrix Particle Dots */}
      <svg
        className="w-full h-full max-w-[420px] max-h-[420px]"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Particle Matrix Columns */}
        <g opacity="0.6">
          {/* Left Vertical Stream */}
          <circle cx="90" cy="140" r="1.5" fill="#00ec97" />
          <circle cx="90" cy="180" r="2" fill="#00ec97" />
          <circle cx="90" cy="220" r="1" fill="#00ec97" />
          <circle cx="95" cy="260" r="2.5" fill="#00ec97" />
          <circle cx="90" cy="300" r="1.5" fill="#00ec97" />

          {/* Central Orbit Stream */}
          <circle cx="280" cy="50" r="1.5" fill="#00ec97" />
          <circle cx="290" cy="70" r="2" fill="#00ec97" />
          <circle cx="285" cy="90" r="1" fill="#00ec97" />
          <circle cx="295" cy="120" r="3" fill="#00ec97" />
          <circle cx="290" cy="150" r="1.5" fill="#00ec97" />
          <circle cx="288" cy="190" r="2" fill="#00ec97" />

          {/* Right Vertical Stream */}
          <circle cx="340" cy="130" r="2" fill="#00ec97" />
          <circle cx="342" cy="160" r="1" fill="#00ec97" />
          <circle cx="340" cy="190" r="2" fill="#00ec97" />
          <circle cx="345" cy="230" r="1.5" fill="#00ec97" />
          <circle cx="338" cy="270" r="2" fill="#00ec97" />
          <circle cx="342" cy="310" r="1.5" fill="#00ec97" />

          {/* Center Lower Stream */}
          <circle cx="220" cy="270" r="2" fill="#00ec97" />
          <circle cx="218" cy="300" r="1" fill="#00ec97" />
          <circle cx="222" cy="320" r="2" fill="#00ec97" />
          <circle cx="225" cy="350" r="2.5" fill="#00ec97" />
          <circle cx="220" cy="370" r="1.5" fill="#00ec97" />
          <circle cx="228" cy="390" r="1" fill="#00ec97" />
        </g>

        {/* Isometric NEAR Geometric Structure */}
        {/* Left Curved Outer Filament */}
        <path
          d="M 100 240 C 95 260 95 280 110 295"
          stroke="#00ec97"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />

        {/* Right Curved Outer Filament */}
        <path
          d="M 310 130 C 322 135 328 145 328 160"
          stroke="#00ec97"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />

        {/* Main 3D NEAR 'N' Isometric Ribbon */}
        {/* Base Depth Layer (Darker Emerald Solid) */}
        <g transform="translate(6, 6)" opacity="0.4">
          <path
            d="M 140 140 
               L 140 280 
               C 140 295 152 305 168 298 
               L 260 170 
               L 260 280 
               C 260 295 275 300 285 290 
               C 295 280 295 265 295 250 
               L 295 140 
               C 295 125 282 115 268 122 
               L 175 250 
               L 175 140 
               C 175 125 160 120 150 130 
               Z"
            fill="#004d2e"
          />
        </g>

        {/* Mid Architectural Glass Layer */}
        <path
          d="M 135 135 
             L 135 275 
             C 135 290 147 300 162 292 
             L 255 165 
             L 255 275 
             C 255 290 270 295 280 285 
             C 290 275 290 260 290 245 
             L 290 135 
             C 290 120 277 110 262 118 
             L 170 245 
             L 170 135 
             C 170 120 155 115 145 125 
             Z"
          fill="#0c1712"
          stroke="#00ec97"
          strokeWidth="4"
          strokeLinejoin="round"
        />

        {/* Inner Isometric Facet Lines (Geometric Architecture) */}
        {/* Left Pillar Front Chamfer */}
        <line
          x1="135"
          y1="140"
          x2="170"
          y2="140"
          stroke="#00ec97"
          strokeWidth="2.5"
          opacity="0.9"
        />
        <line
          x1="170"
          y1="140"
          x2="170"
          y2="245"
          stroke="#00ec97"
          strokeWidth="2.5"
          opacity="0.9"
        />

        {/* Diagonal Cross Truss */}
        <line
          x1="162"
          y1="292"
          x2="255"
          y2="165"
          stroke="#00ec97"
          strokeWidth="3.5"
          opacity="0.9"
        />
        <line
          x1="170"
          y1="245"
          x2="262"
          y2="118"
          stroke="#4dfac0"
          strokeWidth="2"
          opacity="0.9"
        />

        {/* Right Pillar Front Chamfer */}
        <line
          x1="255"
          y1="165"
          x2="290"
          y2="135"
          stroke="#00ec97"
          strokeWidth="2.5"
          opacity="0.9"
        />
        <line
          x1="255"
          y1="275"
          x2="290"
          y2="245"
          stroke="#00ec97"
          strokeWidth="2.5"
          opacity="0.9"
        />

        {/* Structural Edge Accents (Light Reflection Strokes) */}
        <path
          d="M 135 150 L 135 260"
          stroke="#4dfac0"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M 290 150 L 290 230"
          stroke="#4dfac0"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M 180 230 L 245 140"
          stroke="#4dfac0"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Accent Diamond Sparkles */}
        <g transform="translate(360, 340)">
          <path
            d="M 0 -8 L 2.5 -2.5 L 8 0 L 2.5 2.5 L 0 8 L -2.5 2.5 L -8 0 L -2.5 -2.5 Z"
            fill="#3d4354"
          />
        </g>
      </svg>
    </div>
  );
}
