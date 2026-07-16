# Landing Page Redesign v2 Implementation Plan (Fluid Glass & Centered Layout)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the landing page hero headers and lay out the mockups diagonally (bottom-left Editor, top-right PDF Preview) with an animated WebGL gradient background and local 3D Fluid Glass rendering.

**Architecture:** Use `@shadergradient/react` loaded dynamically for the background. Patch the `@react-bits/FluidGlass-JS-CSS` component to render standard geometries locally without external GLB files. Use Tailwind glassmorphism styles on the macOS editor mockup to simulate the glass frame.

**Tech Stack:** Next.js v16, Tailwind CSS v4, Three.js, React Three Fiber, ShaderGradient.

## Global Constraints
* Prevent SSR crashes by dynamically importing all WebGL components with `{ ssr: false }`.
* Do not attempt to load GLB files from the public folder. Use standard Three.js geometry components instead.
* Ensure type safety by running `bun x tsc --noEmit` after updates.

---

### Task 1: Build HeroBackground Component
Create the WebGL gradient background component using dynamic imports.

**Files:**
* Create: `apps/web/components/hero-background.tsx`

**Interfaces:**
* Produces: `<HeroBackground />` React component exported as default.

- [ ] **Step 1: Write HeroBackground component**
  Write the following code to `apps/web/components/hero-background.tsx`:
  ```typescript
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
  ```

- [ ] **Step 2: Verify component compiles**
  Run: `bun x tsc --noEmit` inside `apps/web/`
  Expected output: Exit code 0.

- [ ] **Step 3: Commit component**
  Run:
  ```bash
  git add apps/web/components/hero-background.tsx
  git commit -m "feat(landing): create HeroBackground component using shadergradient"
  ```

---

### Task 2: Refactor FluidGlass for Local Geometries
Refactor `FluidGlass.jsx` to render standard geometries locally, preventing 404 GLB errors.

**Files:**
* Modify: `apps/web/components/FluidGlass.jsx`

**Interfaces:**
* Produces: A self-contained `<FluidGlass />` component that runs without assets fetch dependencies.

- [ ] **Step 1: Replace FluidGlass code**
  Overwrite `apps/web/components/FluidGlass.jsx` with the following implementation using standard Three.js shapes:
  ```jsx
  import * as THREE from 'three';
  import { useRef, useState, useEffect, memo } from 'react';
  import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
  import {
    useFBO,
    Preload,
    ScrollControls,
    MeshTransmissionMaterial
  } from '@react-three/drei';
  import { easing } from 'maath';

  export default function FluidGlass({ mode = 'lens', lensProps = {}, barProps = {}, cubeProps = {} }) {
    const Wrapper = mode === 'bar' ? Bar : mode === 'cube' ? Cube : Lens;
    const rawOverrides = mode === 'bar' ? barProps : mode === 'cube' ? cubeProps : lensProps;

    const {
      navItems = [],
      ...modeProps
    } = rawOverrides;

    return (
      <div className="w-full h-full absolute inset-0 pointer-events-none opacity-60">
        <Canvas camera={{ position: [0, 0, 20], fof: 15 }} gl={{ alpha: true }}>
          <ScrollControls damping={0.2} pages={1} distance={0.4}>
            <Wrapper modeProps={modeProps}>
              <Preload />
            </Wrapper>
          </ScrollControls>
        </Canvas>
      </div>
    );
  }

  const ModeWrapper = memo(function ModeWrapper({
    children,
    geometry,
    followPointer = true,
    modeProps = {},
    ...props
  }) {
    const ref = useRef();
    const buffer = useFBO();
    const { viewport: vp } = useThree();
    const [scene] = useState(() => new THREE.Scene());

    useFrame((state, delta) => {
      const { gl, viewport, pointer, camera } = state;
      const v = viewport.getCurrentViewport(camera, [0, 0, 15]);

      const destX = followPointer ? (pointer.x * v.width) / 2.5 : 0;
      const destY = followPointer ? (pointer.y * v.height) / 2.5 : 0;
      easing.damp3(ref.current.position, [destX, destY, 15], 0.15, delta);

      gl.setRenderTarget(buffer);
      gl.render(scene, camera);
      gl.setRenderTarget(null);
      gl.setClearColor(0x000000, 0);
    });

    const { scale, ior, thickness, anisotropy, chromaticAberration, ...extraMat } = modeProps;

    return (
      <>
        {createPortal(children, scene)}
        <mesh scale={[vp.width, vp.height, 1]}>
          <planeGeometry />
          <meshBasicMaterial map={buffer.texture} transparent opacity={0.1} />
        </mesh>
        <mesh ref={ref} scale={scale ?? 2.8} {...props}>
          {geometry}
          <MeshTransmissionMaterial
            buffer={buffer.texture}
            ior={ior ?? 1.25}
            thickness={thickness ?? 2.0}
            anisotropy={anisotropy ?? 0.15}
            chromaticAberration={chromaticAberration ?? 0.08}
            roughness={0.05}
            transmission={1.0}
            {...extraMat}
          />
        </mesh>
      </>
    );
  });

  function Lens({ modeProps, ...p }) {
    return (
      <ModeWrapper
        geometry={<dodecahedronGeometry args={[1.2, 1]} />}
        followPointer
        modeProps={modeProps}
        {...p}
      />
    );
  }

  function Cube({ modeProps, ...p }) {
    return (
      <ModeWrapper
        geometry={<boxGeometry args={[1.2, 1.2, 1.2]} />}
        followPointer
        modeProps={modeProps}
        {...p}
      />
    );
  }

  function Bar({ modeProps = {}, ...p }) {
    return (
      <ModeWrapper
        geometry={<torusKnotGeometry args={[0.7, 0.22, 120, 16]} />}
        followPointer
        modeProps={modeProps}
        {...p}
      />
    );
  }
  ```

- [ ] **Step 2: Verify compile**
  Run: `bun x tsc --noEmit` inside `apps/web/`
  Expected output: Exit code 0.

- [ ] **Step 3: Commit changes**
  Run:
  ```bash
  git add apps/web/components/FluidGlass.jsx
  git commit -m "fix(landing): refactor FluidGlass to use local shapes instead of glb models"
  ```

---

### Task 3: Refactor HeroMockup for Diagonal Layout
Update `HeroMockup` to position the Editor at the bottom-left, the PDF Preview at the top-right, and style the Editor with a premium fluid glass theme.

**Files:**
* Modify: `apps/web/components/hero-mockup.tsx`

**Interfaces:**
* Consumes: `<FluidGlass />` from `@/components/FluidGlass` (imported dynamically to prevent SSR issue)

- [ ] **Step 1: Apply layout modifications**
  Modify `apps/web/components/hero-mockup.tsx` to:
  1. Dynamically import `FluidGlass` with `ssr: false`.
  2. Embed `<FluidGlass mode="bar" />` behind/inside the editor's background layer for an enhanced 3D glass refraction effect.
  3. Arrange the Editor Card at `bottom-0 left-0` and the PDF Preview Card at `top-0 right-0`.
  4. Style the Editor Card with high-transparency glassmorphism: `bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl`.

  Overwrite `apps/web/components/hero-mockup.tsx` with the following clean code:
  ```typescript
  "use client";

  import React, { useState, useEffect } from "react";
  import { Loader2, CheckCircle2, FileText, Settings, Search } from "lucide-react";
  import dynamic from "next/dynamic";

  const FluidGlass = dynamic(
    () => import("./FluidGlass"),
    { ssr: false }
  );

  const FORMULA = "  \\int_{a}^{b} f(x) \\, dx = F(b) - F(a)";

  type Phase = "typing" | "compiling" | "success";

  export default function HeroMockup() {
    const [phase, setPhase] = useState<Phase>("typing");
    const [typedText, setTypedText] = useState("");
    const [charIndex, setCharIndex] = useState(0);

    // Dynamic typing and state machine effect
    useEffect(() => {
      let timer: NodeJS.Timeout;

      if (phase === "typing") {
        if (charIndex < FORMULA.length) {
          timer = setTimeout(() => {
            setTypedText((prev) => prev + FORMULA[charIndex]);
            setCharIndex((prev) => prev + 1);
          }, 80);
        } else {
          timer = setTimeout(() => {
            setPhase("compiling");
          }, 600);
        }
      } else if (phase === "compiling") {
        timer = setTimeout(() => {
          setPhase("success");
        }, 1500);
      } else if (phase === "success") {
        timer = setTimeout(() => {
          setTypedText("");
          setCharIndex(0);
          setPhase("typing");
        }, 5000);
      }

      return () => clearTimeout(timer);
    }, [phase, charIndex]);

    return (
      <div className="relative w-full h-[320px] sm:h-auto sm:aspect-[4/3] max-w-3xl mx-auto flex items-center justify-center p-2 sm:p-4 lg:p-8 select-none" style={{ perspective: "1000px" }}>
        
        {/* Window 2: PDF Preview (Top-Right / Background) */}
        <div className={`absolute top-0 right-0 w-[52%] bg-white border border-[#e5dacd] rounded-xl shadow-2xl p-4 sm:p-6 transition-all duration-700 font-sans z-10 ${
          phase === "success" 
            ? "translate-x-1 -translate-y-1 scale-[1.02] ring-2 ring-emerald-500/20 border-emerald-300" 
            : "translate-x-0 translate-y-0 scale-100 opacity-90"
        }`}>
          {/* Header section */}
          <div className="border-b border-[#e5dacd]/60 pb-2 sm:pb-3 mb-3 sm:mb-4 text-center">
            <h4 className="text-[9px] sm:text-[11px] font-semibold text-[#0f4c5c] uppercase tracking-wider">
              main.pdf
            </h4>
            <h2 className="text-[12px] sm:text-[14px] font-bold text-[#1c2e36] mt-1.5 sm:mt-2 font-serif">
              Fundamental Theorem of Calculus
            </h2>
            <p className="text-[7px] sm:text-[8px] text-[#5a737e] mt-0.5 sm:mt-1 italic">
              A. Researcher &bull; SomeScript Academy
            </p>
          </div>

          {/* Abstract layout */}
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[7px] sm:text-[8px] font-bold text-[#1c2e36]">Abstract</span>
              <div className="h-0.5 bg-[#efe7dd] rounded-full flex-1" />
            </div>
            <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-full" />
            <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-[92%]" />
            <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-[85%]" />
          </div>

          {/* Core math expression */}
          <div className="my-4 sm:my-6 p-3 sm:p-4 bg-[#FBF6F0] border border-[#e5dacd]/50 rounded-lg flex flex-col items-center justify-center min-h-[50px] sm:min-h-[70px] transition-all duration-500 relative overflow-hidden">
            <div className="absolute top-1.5 left-1.5 text-[6px] sm:text-[8px] font-mono text-[#5a737e]/60">
              [Equation 1]
            </div>
            
            {phase === "success" ? (
              <div className="w-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-500">
                <svg viewBox="0 0 240 60" className="w-full max-w-[150px] sm:max-w-[200px] h-8 sm:h-10 text-[#0f4c5c]" fill="currentColor">
                  <path d="M12,10 C13,5 16,3 18,3 C20,3 21,5 21,7 C21,8 20,9 19,9 C18,9 18,8 18,7 C18,6 17,5 16,5 C14,5 13,10 11,25 L8,45 C7,50 6,53 5,53 C3,53 2,51 2,49 C2,48 3,47 4,47 C5,47 5,48 5,49 C5,50 6,51 7,51 C8,51 10,40 12,25 Z" transform="scale(0.85) translate(10, 2)" />
                  <text x="23" y="14" fontSize="10" fontStyle="italic" fontFamily="serif">b</text>
                  <text x="18" y="44" fontSize="10" fontStyle="italic" fontFamily="serif">a</text>
                  <text x="34" y="32" fontSize="15" fontStyle="italic" fontFamily="serif">f(x) dx</text>
                  <text x="88" y="32" fontSize="15" fontFamily="serif">=</text>
                  <text x="110" y="32" fontSize="15" fontStyle="italic" fontFamily="serif">F(b) - F(a)</text>
                </svg>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-center">
                <div className="h-1.5 bg-[#e5dacd]/40 rounded-full w-16 sm:w-24 animate-pulse" />
                <span className="text-[7px] sm:text-[9px] text-[#5a737e]/40 font-mono">
                  {phase === "compiling" ? "Rendering math..." : "Awaiting compilation"}
                </span>
              </div>
            )}
          </div>

          {/* Bottom paragraph preview */}
          <div className="flex flex-col gap-1 sm:gap-1.5">
            <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-full" />
            <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-[96%]" />
            <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-[60%]" />
          </div>
        </div>

        {/* Window 1: Code Editor (Bottom-Left / Foreground) - Style as Fluid Glass */}
        <div className="absolute bottom-0 left-0 w-[55%] bg-[#0e161b]/35 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl p-3 sm:p-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-3xl z-20 font-mono text-[9px] sm:text-[11px] leading-relaxed overflow-hidden">
          
          {/* Embed the interactive FluidGlass canvas in the background */}
          <FluidGlass mode="bar" />

          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5 select-none relative z-10">
            {/* macOS Buttons */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#ff5f56]" />
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#27c93f]" />
            </div>
            
            {/* Active/Inactive tabs */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="bg-white/10 border border-white/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-md text-[8px] sm:text-[10px] text-white/90 flex items-center gap-1.5 font-sans font-medium">
                <FileText className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#cbd2d6]" />
                main.tex
              </div>
              <div className="px-1.5 py-0.5 sm:py-1 text-[8px] sm:text-[10px] text-white/50 hover:text-white/80 transition-colors font-sans">
                references.bib
              </div>
            </div>

            <div className="flex gap-1 sm:gap-1.5 text-white/45">
              <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <Settings className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </div>
          </div>

          {/* Code Layout & Lines */}
          <div className="flex font-mono text-[8px] sm:text-[10px] relative z-10 text-white/95">
            {/* Line Numbers */}
            <div className="text-white/30 select-none pr-2.5 sm:pr-3.5 border-r border-white/10 text-right flex flex-col gap-1 w-5 sm:w-6">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
              <span>6</span>
              <span>7</span>
              <span>8</span>
              <span>9</span>
              <span>10</span>
            </div>

            {/* Code Lines Body */}
            <div className="pl-2.5 sm:pl-3.5 flex-1 flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="text-[#c3c4f9]/90">\documentclass</span>
                <span>&#123;article&#125;</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[#c3c4f9]/90">\usepackage</span>
                <span>&#123;amsmath&#125;</span>
              </div>
              <div className="h-1.5 flex items-center my-0.5">
                <div className="h-0.5 bg-white/20 rounded-full w-16 sm:w-24" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[#ffafba]/90">\begin</span>
                <span>&#123;document&#125;</span>
              </div>
              <div className="flex items-center gap-1 pl-2 sm:pl-3">
                <span className="text-[#96dcf8]/90">\section</span>
                <span>&#123;Introduction&#125;</span>
              </div>
              <div className="h-1.5 flex items-center my-0.5 pl-2 sm:pl-3">
                <div className="h-0.5 bg-white/20 rounded-full w-24 sm:w-36" />
              </div>
              <div className="flex items-center gap-1 pl-2 sm:pl-3">
                <span className="text-[#ffafba]/90">\begin</span>
                <span>&#123;equation&#125;</span>
              </div>

              {/* Typed Math Formula */}
              <div className="text-[#8cedc4] font-medium flex items-center min-h-[12px] sm:min-h-[14px]">
                <span className="whitespace-pre">{typedText}</span>
                <span className="w-0.5 h-3 sm:h-3.5 bg-[#8cedc4] ml-0.5 animate-pulse" />
              </div>

              <div className="flex items-center gap-1 pl-2 sm:pl-3">
                <span className="text-[#ffafba]/90">\end</span>
                <span>&#123;equation&#125;</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[#ffafba]/90">\end</span>
                <span>&#123;document&#125;</span>
              </div>
            </div>
          </div>

          {/* Editor Status Bar */}
          <div className="mt-3.5 pt-2 border-t border-white/10 flex items-center justify-between text-[8px] sm:text-[9px] text-white/50 select-none relative z-10">
            <div className="flex items-center gap-2 sm:gap-3">
              <span>LaTeX</span>
              <span>UTF-8</span>
              <span>Ln 8, Col {typedText.length + 1}</span>
            </div>

            {/* Compiler Status Badge */}
            <div className="flex items-center gap-1.5">
              {phase === "typing" && (
                <div className="flex items-center gap-1 text-[#96dcf8] bg-[#96dcf8]/10 border border-[#96dcf8]/20 px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-sans">
                  Editing
                </div>
              )}
              {phase === "compiling" && (
                <div className="flex items-center gap-1 text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-sans animate-pulse">
                  <Loader2 className="w-2 sm:w-2.5 h-2 sm:h-2.5 animate-spin" />
                  Compiling...
                </div>
              )}
              {phase === "success" && (
                <div className="flex items-center gap-1 text-[#8cedc4] bg-[#8cedc4]/10 border border-[#8cedc4]/20 px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-sans">
                  <CheckCircle2 className="w-2 sm:w-2.5 h-2 sm:h-2.5" />
                  Success
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    );
  }
  ```

- [ ] **Step 2: Verify compile**
  Run: `bun x tsc --noEmit` inside `apps/web/`
  Expected output: Exit code 0.

- [ ] **Step 3: Commit changes**
  Run:
  ```bash
  git add apps/web/components/hero-mockup.tsx
  git commit -m "style(landing): update HeroMockup layout to diagonal and add FluidGlass frame styles"
  ```

---

### Task 4: Center Hero Layout in page.tsx
Center headings/badge/CTAs, embed `HeroBackground`, and layout the page correctly.

**Files:**
* Modify: `apps/web/app/page.tsx`

**Interfaces:**
* Consumes: `<HeroBackground />` from `@/components/hero-background`
* Consumes: `<HeroMockup />` from `@/components/hero-mockup`

- [ ] **Step 1: Overwrite page.tsx content**
  Overwrite `apps/web/app/page.tsx` with:
  ```typescript
  import Link from "next/link";
  import Image from "next/image";
  import { Sparkles, ArrowRight, Code, FileText, CheckCircle2, ChevronRight } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import HeroMockup from "@/components/hero-mockup";
  import HeroBackground from "@/components/hero-background";

  export default function Home() {
    return (
      <div className="flex flex-col min-h-screen bg-transparent text-foreground font-sans selection:bg-primary/20 relative overflow-hidden">
        {/* Animated WebGL Gradient Background */}
        <HeroBackground />

        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-md bg-background/50 border-b border-border/40 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Image src="/logo.svg" alt="SomeScript Logo" width={36} height={36} className="h-9 w-9 -mr-1.5" />
            <span className="font-semibold text-lg tracking-tight text-foreground">
              SomeScript
            </span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              Dashboard
            </Link>
            <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-all shadow-md shadow-primary/10">
              <Link href="/dashboard">
                Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        {/* Main Hero Section */}
        <main className="flex-1 flex flex-col items-center px-6 relative py-16 lg:py-24 max-w-7xl mx-auto w-full z-10">
          
          {/* Centered Hero Headers */}
          <div className="text-center flex flex-col items-center gap-6 max-w-3xl mx-auto">
            
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold tracking-wide backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Introducing AI Typesetting Engine v2.0
            </div>

            {/* Heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium font-serif tracking-tight leading-tight text-foreground">
              Research Deserves
              <span className="block mt-1 bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary/95 to-primary/80 font-serif">
                Perfection.
              </span>
            </h1>

            {/* Paragraph */}
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed font-light max-w-2xl">
              Transform rough notes and PDF drafts into publication-ready LaTeX. Powered by a Senior Researcher AI that understands the math, not just the text.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center mt-2">
              <Button asChild size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-6 rounded-lg text-base shadow-lg shadow-primary/15 transition-all font-semibold cursor-pointer">
                <Link href="/dashboard">
                  Start Typesetting Free <ChevronRight className="ml-1.5 h-5 w-5" />
                </Link>
              </Button>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-light px-2 py-2 sm:py-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                No credit card required
              </div>
            </div>
          </div>

          {/* Overlapping Diagonal IDE Mockup Component */}
          <div className="w-full max-w-4xl mt-16 sm:mt-20">
            <HeroMockup />
          </div>

          {/* Feature Grid Section */}
          <section className="mt-28 lg:mt-36 w-full grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="p-6 rounded-xl border border-border/40 bg-card/45 backdrop-blur-md flex flex-col gap-4 shadow-sm">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Code className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg text-foreground font-serif">AI Generation</h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-light">
                Prompt for document outlines, complex math environments, tables, or bibliographies and watch them build instantly.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border/40 bg-card/45 backdrop-blur-md flex flex-col gap-4 shadow-sm">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg text-foreground font-serif">Tectonic Compilation</h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-light">
                Fast, on-demand compilation that runs on high-speed servers and outputs premium PDF formats directly in your browser.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border/40 bg-card/45 backdrop-blur-md flex flex-col gap-4 shadow-sm">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg text-foreground font-serif">Workspace Isolation</h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-light">
                Organize your documents under professional workspaces (powered by Clerk) for simple collaboration and document history.
              </p>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/40 py-8 px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-4 mt-auto bg-card/10 backdrop-blur-sm z-10">
          <span className="font-light">© 2026 SomeScript. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Docs</a>
          </div>
        </footer>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify page build**
  Run: `bun run build` inside `apps/web/`
  Expected output: Clean production bundle success.

- [ ] **Step 3: Commit code changes**
  Run:
  ```bash
  git add apps/web/app/page.tsx
  git commit -m "feat(landing): center hero headers and integrate shadergradient background"
  ```
