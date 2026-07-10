"use client";

import React, { useEffect, useState } from "react";
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

export default function HeroBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none w-full h-full min-h-screen">
      <ShaderGradientCanvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <ShaderGradient
          control="query"
          urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=off&bgColor1=%23000000&bgColor2=%23000000&cameraZoom=1.1&color1=%230f4c5c&color2=%23e5dacd&color3=%23efe7dd&embedMode=off&envMap=on&fog=on&fov=45&frameRate=60&gizmoHelper=off&grain=on&lightType=3d&pixelDensity=1&positionX=0&positionY=0&positionZ=0&range=0.5&rangeEnd=40&reflection=0.1&rotationX=0&rotationY=0&rotationZ=0&shader=1&type=waterPlane&uAmplitude=0&uDensity=1.5&uFrequency=5.5&uSpeed=0.08&uTime=0&wireframe=off"
        />
      </ShaderGradientCanvas>
      
      {/* Soft layout mask overlay to keep text legible */}
      <div className="absolute inset-0 bg-background/85 backdrop-blur-[1px]" />
    </div>
  );
}
