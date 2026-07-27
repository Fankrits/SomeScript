"use client";

import React, { useState, useEffect } from "react";
import { Loader2, CheckCircle2, FileText, Settings, Search } from "lucide-react";
import { LiquidGlassCard } from "./kokonutui/liquid-glass-card";

const FORMULA = "  \\int_{a}^{b} f(x) \\, dx = F(b) - F(a)";

type Phase = "typing" | "compiling" | "success";

type HeroMockupProps = {
  overlay?: React.ReactNode;
};

export default function HeroMockup({ overlay }: HeroMockupProps) {
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
    <div className="relative mx-auto w-full max-w-6xl flex flex-col gap-6 lg:block lg:h-[min(720px,70vh)] xl:h-[min(780px,72vh)]" style={{ perspective: "1000px" }}>
      {overlay && (
        <div className="order-0 lg:absolute lg:inset-0 lg:z-30 lg:flex lg:items-center lg:justify-center">
          {overlay}
        </div>
      )}

      {/* Window 2: PDF Preview (Top-Right / Background) */}
      <div className={`order-1 w-full bg-white border border-[#e5dacd] rounded-xl shadow-2xl p-3 sm:p-4 transition-all duration-700 font-sans overflow-hidden animate-hero-float lg:absolute lg:top-0 lg:right-0 lg:z-10 lg:w-[34%] lg:aspect-[3/4] lg:-rotate-y-[10deg] lg:rotate-x-[2deg] ${
        phase === "success"
          ? "translate-x-1 -translate-y-1 scale-[1.02] ring-2 ring-emerald-500/20 border-emerald-300"
          : "translate-x-0 translate-y-0 scale-100 opacity-90"
      }`}>
        {/* Header section */}
        <div className="border-b border-[#e5dacd]/60 pb-1.5 sm:pb-2 mb-2 sm:mb-2.5 text-center">
          <h4 className="text-[9px] sm:text-[11px] font-semibold text-[#0f4c5c] uppercase tracking-wider">
            main.pdf
          </h4>
          <h2 className="text-[12px] sm:text-[14px] font-bold text-[#1c2e36] mt-1 sm:mt-1.5 font-serif">
            Fundamental Theorem of Calculus
          </h2>
          <p className="text-[7px] sm:text-[8px] text-[#5a737e] mt-0.5 italic">
            A. Researcher &bull; SomeScript Academy
          </p>
        </div>

        {/* Abstract layout */}
        <div className="flex flex-col gap-1 sm:gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] sm:text-[8px] font-bold text-[#1c2e36]">Abstract</span>
            <div className="h-0.5 bg-[#efe7dd] rounded-full flex-1" />
          </div>
          <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-full" />
          <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-[92%]" />
          <div className="h-1 sm:h-1.5 bg-[#efe7dd]/70 rounded-full w-[85%]" />
        </div>

        {/* Core math expression */}
        <div className="my-2.5 sm:my-3.5 p-2.5 sm:p-3 bg-[#FBF6F0] border border-[#e5dacd]/50 rounded-lg flex flex-col items-center justify-center min-h-[40px] sm:min-h-[54px] transition-all duration-500 relative overflow-hidden">
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

      {/* Window 1: Code Editor (Bottom-Left / Foreground) */}
      <LiquidGlassCard glassSize="sm" className="order-2 w-full bg-background border border-border rounded-xl shadow-2xl p-3 sm:p-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-3xl animate-hero-float [animation-delay:-3s] lg:absolute lg:bottom-0 lg:left-0 lg:z-20 lg:w-[42%] lg:aspect-[4/3] lg:rotate-y-[10deg] lg:rotate-x-[-2deg] font-mono text-[9px] sm:text-[11px] leading-relaxed">

        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-border pb-1.5 mb-2 select-none relative z-10">
          {/* macOS Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#ff5f56]" />
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#27c93f]" />
          </div>

          {/* Active/Inactive tabs */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="bg-foreground/5 border border-border px-2 sm:px-3 py-0.5 sm:py-1 rounded-md text-[8px] sm:text-[10px] text-foreground flex items-center gap-1.5 font-sans font-medium">
              <FileText className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-foreground/50" />
              main.tex
            </div>
            <div className="px-1.5 py-0.5 sm:py-1 text-[8px] sm:text-[10px] text-foreground/50 hover:text-foreground transition-colors font-sans">
              references.bib
            </div>
          </div>

          <div className="flex gap-1 sm:gap-1.5 text-foreground/40">
            <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <Settings className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          </div>
        </div>

        {/* Code Layout & Lines */}
        <div className="flex font-mono text-[8px] sm:text-[10px] relative z-10 text-foreground">
          {/* Line Numbers */}
          <div className="text-foreground/30 select-none pr-2.5 sm:pr-3.5 border-r border-border text-right flex flex-col gap-1 w-5 sm:w-6">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
            <span>7</span>
            <span>8</span>
            <span>9</span>
          </div>

          {/* Code Lines Body */}
          <div className="pl-2.5 sm:pl-3.5 flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-[#5b52c9]">\documentclass</span>
              <span>&#123;article&#125;</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[#5b52c9]">\usepackage</span>
              <span>&#123;amsmath&#125;</span>
            </div>
            <div className="h-1.5 flex items-center my-0.5">
              <div className="h-0.5 bg-foreground/15 rounded-full w-16 sm:w-24" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[#c2415a]">\begin</span>
              <span>&#123;document&#125;</span>
            </div>
            <div className="flex items-center gap-1 pl-2 sm:pl-3">
              <span className="text-[#1f7ea6]">\section</span>
              <span>&#123;Introduction&#125;</span>
            </div>
            <div className="h-1.5 flex items-center my-0.5 pl-2 sm:pl-3">
              <div className="h-0.5 bg-foreground/15 rounded-full w-24 sm:w-36" />
            </div>
            <div className="flex items-center gap-1 pl-2 sm:pl-3">
              <span className="text-[#c2415a]">\begin</span>
              <span>&#123;equation&#125;</span>
            </div>

            {/* Typed Math Formula */}
            <div className="text-[#1f9563] font-medium flex items-center min-h-[12px] sm:min-h-[14px] overflow-x-auto scrollbar-none">
              <span className="whitespace-pre truncate sm:whitespace-pre">{typedText}</span>
              <span className="w-0.5 h-3 sm:h-3.5 bg-[#1f9563] ml-0.5 animate-pulse shrink-0" />
            </div>

            <div className="flex items-center gap-1 pl-2 sm:pl-3">
              <span className="text-[#c2415a]">\end</span>
              <span>&#123;equation&#125;</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[#c2415a]">\end</span>
              <span>&#123;document&#125;</span>
            </div>
          </div>
        </div>

        {/* Editor Status Bar */}
        <div className="mt-2.5 pt-1.5 border-t border-border flex items-center justify-between text-[8px] sm:text-[9px] text-foreground/50 select-none relative z-10">
          <div className="flex items-center gap-2 sm:gap-3">
            <span>LaTeX</span>
            <span>UTF-8</span>
            <span>Ln 8, Col {typedText.length + 1}</span>
          </div>

          {/* Compiler Status Badge */}
          <div className="flex items-center gap-1.5">
            {phase === "typing" && (
              <div className="flex items-center gap-1 text-[#1f7ea6] bg-[#1f7ea6]/10 border border-[#1f7ea6]/20 px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-sans">
                Editing
              </div>
            )}
            {phase === "compiling" && (
              <div className="flex items-center gap-1 text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-sans animate-pulse">
                <Loader2 className="w-2 sm:w-2.5 h-2 sm:h-2.5 animate-spin" />
                Compiling...
              </div>
            )}
            {phase === "success" && (
              <div className="flex items-center gap-1 text-[#1f9563] bg-[#1f9563]/10 border border-[#1f9563]/20 px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-sans">
                <CheckCircle2 className="w-2 sm:w-2.5 h-2 sm:h-2.5" />
                Success
              </div>
            )}
          </div>
        </div>
      </LiquidGlassCard>

    </div>
  );
}
