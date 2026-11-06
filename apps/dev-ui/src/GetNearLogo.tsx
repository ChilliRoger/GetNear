import { useEffect, useRef, useCallback } from "react";
import { geoOrthographic, geoPath, geoGraticule } from "d3-geo";

interface GetNearLogoProps {
  /** Width & height in px (square). Default 320. */
  size?: number;
  /** Rotation speed in degrees/frame. Default 0.3. */
  speed?: number;
  /** Show the rounded-rect app-icon background. Default false. */
  withBackground?: boolean;
  /** Scale up text to nearly fill the globe — useful at small sizes. Default false. */
  largeText?: boolean;
  /** Crop to top-left quarter of the globe with FX repositioned inside. Default false. */
  cropped?: boolean;
  /** Accent color for the globe and text. Default "#00d4aa". */
  color?: string;
  /** Extra className on the outermost element. */
  className?: string;
}

export function GetNearLogo({
  size = 320,
  speed = 0.3,
  withBackground = false,
  largeText = false,
  cropped = false,
  color = "#00d4aa",
  className = "",
}: GetNearLogoProps) {
  const graticuleRef = useRef<SVGPathElement>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number>(0);

  // In cropped mode, the globe is rendered at 2x then we show the top-left quarter
  const globeSize = cropped ? size * 2 : size;
  const scale = (globeSize / 320) * 120;
  const cx = globeSize / 2;
  const cy = globeSize / 2;
  const center: [number, number] = [cx, cy];

  const animate = useCallback(() => {
    const el = graticuleRef.current;
    if (!el) return;

    rotationRef.current += speed;

    const projection = geoOrthographic()
      .scale(scale)
      .translate([cx, cy])
      .clipAngle(90)
      .rotate([rotationRef.current, -15, 0]);

    const pathGen = geoPath().projection(projection);
    const graticule = geoGraticule().step([20, 20]);

    el.setAttribute("d", pathGen(graticule()) || "");

    rafRef.current = requestAnimationFrame(animate);
  }, [scale, cx, cy, speed]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  // Compute initial sphere path (static outline)
  const spherePath = (() => {
    const proj = geoOrthographic()
      .scale(scale)
      .translate(center)
      .clipAngle(90);
    return geoPath().projection(proj)({ type: "Sphere" }) || "";
  })();

  // Scale-relative values — all positions are relative to globeSize
  const gs = globeSize / 320; // globe scale factor
  const s = size / 320; // output scale factor (for non-cropped)
  const t = largeText ? 1.85 : 1; // text scale multiplier

  const svg = (
    <svg
      viewBox={cropped ? `0 0 ${globeSize / 2} ${globeSize / 2}` : `0 0 ${size} ${size}`}
      width={size}
      height={size}
      style={{ borderRadius: withBackground ? `${22.5 * s}px` : undefined }}
    >
      <defs>
        <filter id="ml-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={3 * gs} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="ml-text-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={4 * gs} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Globe outline */}
      <path
        d={spherePath}
        fill="none"
        stroke={color}
        strokeWidth={3 * gs}
        filter="url(#ml-glow)"
      />

      {/* Rotating graticule */}
      <path
        ref={graticuleRef}
        fill="none"
        stroke={color}
        strokeWidth={1.5 * gs}
        filter="url(#ml-glow)"
        opacity={0.85}
      />

      {/* GetNear — hidden in largeText/cropped modes */}
      {!largeText && !cropped && (
        <text
          x={globeSize / 2}
          y={130 * gs}
          fill={color}
          fontSize={15 * gs}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
          filter="url(#ml-text-glow)"
          stroke="#11151b"
          strokeWidth={6 * gs}
          paintOrder="stroke fill"
          textLength={100 * gs}
          lengthAdjust="spacing"
        >
          GetNear
        </text>
      )}

      {/* FX */}
      <text
        x={cropped ? globeSize * 0.49 : globeSize / 2}
        y={cropped ? globeSize * 0.44 : (largeText ? 219 : 214) * gs}
        fill={color}
        fontSize={(cropped ? 97 : 92 * t) * gs}
        fontWeight={800}
        textAnchor={cropped ? "end" : "middle"}
        dominantBaseline={cropped ? "auto" : "central"}
        filter="url(#ml-text-glow)"
        stroke="#11151b"
        strokeWidth={10 * gs}
        paintOrder="stroke fill"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      >
        <tspan>F</tspan>
        <tspan dx={-16 * (cropped ? 1 : t) * gs}>X</tspan>
      </text>
    </svg>
  );

  if (!withBackground) return <div className={`overflow-hidden ${className}`}>{svg}</div>;

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: `${22.5 * s}px`,
        background: "linear-gradient(145deg, #161b22, #0d1116)",
        boxShadow: `0 ${30 * s}px ${60 * s}px rgba(0,0,0,0.8), inset 0 1px 2px rgba(255,255,255,0.05), inset 0 0 0 1px rgba(0,212,170,0.1), 0 0 ${40 * s}px rgba(0,212,170,0.15)`,
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Glowing border overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          padding: 2,
          background:
            "linear-gradient(135deg, rgba(0,212,170,0.4), transparent 60%)",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          pointerEvents: "none",
        }}
      />
      {svg}
    </div>
  );
}
