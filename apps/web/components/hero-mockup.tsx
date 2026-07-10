"use client";

import React, { useState, useEffect } from "react";
import { Loader2, CheckCircle2, FileText, Settings, Search } from "lucide-react";

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
        // Pause briefly, then start compiling
        timer = setTimeout(() => {
          setPhase("compiling");
        }, 600);
      }
    } else if (phase === "compiling") {
      // Mock compile delay
      timer = setTimeout(() => {
        setPhase("success");
      }, 1500);
    } else if (phase === "success") {
      // Display result for 5 seconds before reset
      timer = setTimeout(() => {
        setTypedText("");
        setCharIndex(0);
        setPhase("typing");
      }, 5000);
    }

    return () => clearTimeout(timer);
  }, [phase, charIndex]);

  return (
    <div className="relative w-full h-[320px] sm:h-auto sm:aspect-[4/3] max-w-2xl mx-auto flex items-center justify-center p-2 sm:p-4 lg:p-8 select-none" style={{ perspective: "1000px" }}>
      
      {/* Window 2: PDF Preview (Background Layer) */}
      <div className={`absolute top-0 right-4 w-[60%] bg-white border border-[#e5dacd] rounded-xl shadow-2xl p-6 transition-all duration-700 font-sans z-10 ${
        phase === "success" 
          ? "translate-x-1 -translate-y-1 scale-[1.02] ring-2 ring-emerald-500/20 border-emerald-300" 
          : "translate-x-0 translate-y-0 scale-100 opacity-90"
      }`}>
        {/* Header section representing standard LaTeX document preview */}
        <div className="border-b border-[#e5dacd]/60 pb-3 mb-4 text-center">
          <h4 className="text-[11px] font-semibold text-[#0f4c5c] uppercase tracking-wider">
            main.pdf
          </h4>
          <h2 className="text-[14px] font-bold text-[#1c2e36] mt-2 font-serif">
            Fundamental Theorem of Calculus
          </h2>
          <p className="text-[8px] text-[#5a737e] mt-1 italic">
            A. Researcher &bull; SomeScript Academy
          </p>
        </div>

        {/* Abstract layout using crisp vector bars */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold text-[#1c2e36]">Abstract</span>
            <div className="h-1 bg-[#efe7dd] rounded-full flex-1" />
          </div>
          <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-full" />
          <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-[92%]" />
          <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-[85%]" />
        </div>

        {/* Core math expression rendering block */}
        <div className="my-6 p-4 bg-[#FBF6F0] border border-[#e5dacd]/50 rounded-lg flex flex-col items-center justify-center min-h-[70px] transition-all duration-500 relative overflow-hidden">
          <div className="absolute top-2 left-2 text-[8px] font-mono text-[#5a737e]/60">
            [Equation 1]
          </div>
          
          {phase === "success" ? (
            <div className="w-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-500">
              <svg viewBox="0 0 240 60" className="w-full max-w-[200px] h-10 text-[#0f4c5c]" fill="currentColor">
                {/* Integral Symbol */}
                <path d="M12,10 C13,5 16,3 18,3 C20,3 21,5 21,7 C21,8 20,9 19,9 C18,9 18,8 18,7 C18,6 17,5 16,5 C14,5 13,10 11,25 L8,45 C7,50 6,53 5,53 C3,53 2,51 2,49 C2,48 3,47 4,47 C5,47 5,48 5,49 C5,50 6,51 7,51 C8,51 10,40 12,25 Z" transform="scale(0.85) translate(10, 2)" />
                <text x="23" y="14" fontSize="10" fontStyle="italic" fontFamily="serif">b</text>
                <text x="18" y="44" fontSize="10" fontStyle="italic" fontFamily="serif">a</text>
                <text x="34" y="32" fontSize="15" fontStyle="italic" fontFamily="serif">f(x) dx</text>
                <text x="88" y="32" fontSize="15" fontFamily="serif">=</text>
                <text x="110" y="32" fontSize="15" fontStyle="italic" fontFamily="serif">F(b) - F(a)</text>
              </svg>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="h-2 bg-[#e5dacd]/40 rounded-full w-24 animate-pulse" />
              <span className="text-[9px] text-[#5a737e]/40 font-mono">
                {phase === "compiling" ? "Rendering math..." : "Awaiting compilation"}
              </span>
            </div>
          )}
        </div>

        {/* Bottom paragraph preview */}
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-full" />
          <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-[96%]" />
          <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-[60%]" />
        </div>
      </div>

      {/* Window 1: Code Editor (Foreground Layer) */}
      <div className="absolute bottom-0 left-4 w-[60%] bg-[#121c21]/95 backdrop-blur-md border border-[#2d8297]/20 rounded-xl shadow-2xl p-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-3xl z-20 font-mono text-[11px] leading-relaxed">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-[#2d8297]/10 pb-2.5 mb-3 select-none">
          {/* macOS Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
          </div>
          
          {/* Active/Inactive tabs */}
          <div className="flex items-center gap-2">
            <div className="bg-[#1a2b33] border border-[#2d8297]/15 px-3 py-1 rounded-md text-[10px] text-[#8cedc4] flex items-center gap-1.5 font-sans font-medium">
              <FileText className="w-3 h-3 text-[#2d8297]" />
              main.tex
            </div>
            <div className="px-2 py-1 text-[10px] text-[#5a737e] hover:text-[#8cedc4]/60 transition-colors font-sans">
              references.bib
            </div>
          </div>

          <div className="flex gap-1.5 text-[#5a737e]">
            <Search className="w-3 h-3" />
            <Settings className="w-3 h-3" />
          </div>
        </div>

        {/* Code Layout & Lines */}
        <div className="flex font-mono text-[10px]">
          {/* Line Numbers */}
          <div className="text-[#5a737e]/40 select-none pr-3.5 border-r border-[#2d8297]/10 text-right flex flex-col gap-1 w-6">
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
          <div className="pl-3.5 flex-1 flex flex-col gap-1 text-[#cbd2d6]">
            {/* Line 1: preamble */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#c3c4f9]">\documentclass</span>
              <span className="text-[#cbd2d6]">&#123;article&#125;</span>
            </div>
            
            {/* Line 2: packages */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#c3c4f9]">\usepackage</span>
              <span className="text-[#cbd2d6]">&#123;amsmath&#125;</span>
            </div>
            
            {/* Line 3: abstract lines representing metadata */}
            <div className="h-2 flex items-center my-0.5">
              <div className="h-1 bg-[#5a737e]/30 rounded-full w-24" />
            </div>

            {/* Line 4: begin document */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#ffafba]">\begin</span>
              <span className="text-[#cbd2d6]">&#123;document&#125;</span>
            </div>

            {/* Line 5: sections */}
            <div className="flex items-center gap-1.5 pl-3">
              <span className="text-[#96dcf8]">\section</span>
              <span className="text-[#cbd2d6]">&#123;Introduction&#125;</span>
            </div>

            {/* Line 6: abstract block */}
            <div className="h-2 flex items-center my-0.5 pl-3">
              <div className="h-1 bg-[#5a737e]/30 rounded-full w-36" />
            </div>

            {/* Line 7: begin equation */}
            <div className="flex items-center gap-1.5 pl-3">
              <span className="text-[#ffafba]">\begin</span>
              <span className="text-[#cbd2d6]">&#123;equation&#125;</span>
            </div>

            {/* Line 8: The Typed Math Formula */}
            <div className="text-[#8cedc4] font-medium flex items-center min-h-[14px]">
              <span className="whitespace-pre">{typedText}</span>
              <span className="w-1 h-3.5 bg-[#8cedc4] ml-0.5 animate-pulse" />
            </div>

            {/* Line 9: end equation */}
            <div className="flex items-center gap-1.5 pl-3">
              <span className="text-[#ffafba]">\end</span>
              <span className="text-[#cbd2d6]">&#123;equation&#125;</span>
            </div>

            {/* Line 10: end document */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#ffafba]">\end</span>
              <span className="text-[#cbd2d6]">&#123;document&#125;</span>
            </div>
          </div>
        </div>

        {/* Editor Status Bar */}
        <div className="mt-4 pt-2.5 border-t border-[#2d8297]/10 flex items-center justify-between text-[9px] text-[#5a737e] select-none">
          <div className="flex items-center gap-3">
            <span>LaTeX</span>
            <span>UTF-8</span>
            <span>Ln 8, Col {typedText.length + 1}</span>
          </div>

          {/* Compiler Status Badge */}
          <div className="flex items-center gap-1.5">
            {phase === "typing" && (
              <div className="flex items-center gap-1 text-[#96dcf8] bg-[#96dcf8]/10 border border-[#96dcf8]/20 px-1.5 py-0.5 rounded text-[8px] font-sans">
                Editing
              </div>
            )}
            {phase === "compiling" && (
              <div className="flex items-center gap-1 text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded text-[8px] font-sans animate-pulse">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Compiling...
              </div>
            )}
            {phase === "success" && (
              <div className="flex items-center gap-1 text-[#8cedc4] bg-[#8cedc4]/10 border border-[#8cedc4]/20 px-1.5 py-0.5 rounded text-[8px] font-sans">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Success
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
