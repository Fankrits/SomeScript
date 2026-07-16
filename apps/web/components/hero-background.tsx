"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";

// Dynamically import WebGL elements to prevent SSR window reference crashes
const ShaderGradientCanvas = dynamic(
  () => import("@shadergradient/react").then((mod) => mod.ShaderGradientCanvas),
  { ssr: false }
);

const ShaderGradient = dynamic(
  () => import("@shadergradient/react").then((mod) => mod.ShaderGradient),
  { ssr: false }
);

export default function HeroBackground({ className = "" }: { className?: string }) {
  const [isVisible, setIsVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Prevent observer crash or execution on systems without support (SSR/older browsers)
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.01 } // Triggers if even 1% of the hero is visible
    );

    const currentRef = containerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-0 overflow-hidden pointer-events-none ${className}`}
    >
      {isVisible ? (
        <ShaderGradientCanvas
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "transparent" }}
          lazyLoad={true}
          pixelDensity={1} // Cap pixel density at 1 to prevent rendering bottleneck on high-DPI/Retina screens
          pointerEvents="none"
        >
          <ShaderGradient
            animate="on"
            type="sphere"
            wireframe={false}
            shader="defaults"
            uTime={0}
            uSpeed={0.25}
            uStrength={0.25}
            uDensity={0.8}
            uFrequency={5.5}
            uAmplitude={3.2}
            positionX={-0.1}
            positionY={0}
            positionZ={0}
            rotationX={0}
            rotationY={130}
            rotationZ={70}
            color1="#dd7e21"
            color2="#0f4c5c"
            color3="#8da0ce"
            reflection={0.4}
            cAzimuthAngle={270}
            cPolarAngle={180}
            cDistance={0.5}
            cameraZoom={15.1}
            lightType="env"
            brightness={0.8}
            envPreset="city"
            grain="on" // Re-enabled grain noise calculations in the fragment shader
            toggleAxis={false}
            zoomOut={false}
            hoverState=""
            enableTransition={false}
          />
        </ShaderGradientCanvas>
      ) : (
        // Performance fallback: lightweight, static CSS radial gradient representing the colors
        <div
          className="absolute inset-0 w-full h-full bg-[#FBF6F0] transition-opacity duration-300"
          style={{
            backgroundImage: "radial-gradient(circle at 10% 25%, rgba(221,126,33,0.1) 0%, transparent 45%), radial-gradient(circle at 90% 75%, rgba(15,76,92,0.1) 0%, transparent 45%)"
          }}
        />
      )}
    </div>
  );
}
