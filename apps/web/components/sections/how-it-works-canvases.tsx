"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";

export function Step1WritePromptCanvas() {
  const codeLines = [
    { line: "01", text: "\\begin{equation}", color: "text-purple-600 dark:text-purple-400" },
    { line: "02", text: "  R = \\begin{pmatrix}", color: "text-blue-600 dark:text-blue-400" },
    { line: "03", text: "    \\cos\\theta & -\\sin\\theta \\\\", color: "text-emerald-600 dark:text-emerald-400" },
    { line: "04", text: "    \\sin\\theta &  \\cos\\theta", color: "text-emerald-600 dark:text-emerald-400" },
    { line: "05", text: "  \\end{pmatrix}", color: "text-blue-600 dark:text-blue-400" },
    { line: "06", text: "\\end{equation}", color: "text-purple-600 dark:text-purple-400" },
  ];

  const [visibleLineCount, setVisibleLineCount] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleLineCount((prev) => (prev < codeLines.length ? prev + 1 : prev));
    }, 400);
    return () => clearInterval(interval);
  }, [codeLines.length]);

  return (
    <div className="w-full max-w-xl space-y-3">
      {/* Floating Natural Language Prompt Bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2.5 bg-background/90 border border-primary/20 px-3.5 py-2 rounded-xl text-xs shadow-md backdrop-blur-md"
      >
        <p className="text-foreground/80 font-mono text-[11px] truncate">
          <span className="text-primary font-semibold">Prompt:</span> &ldquo;Create a 2D rotation matrix equation in LaTeX&rdquo;
        </p>
      </motion.div>

      {/* Code Editor Window */}
      <LiquidGlassCard className="w-full border-border/60 bg-background/95 p-4 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/50 pb-2.5 mb-3 text-foreground/50 text-[11px]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 mr-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <span className="font-mono text-foreground/80 font-medium">matrix_rotation.tex</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-foreground/40">
            <span>UTF-8</span>
            <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded">LaTeX</span>
          </div>
        </div>

        {/* Code Content */}
        <div className="space-y-1 font-mono text-xs leading-relaxed min-h-[140px] px-1">
          {codeLines.slice(0, visibleLineCount).map((item) => (
            <div key={item.line} className="flex items-center gap-3 group">
              <span className="text-foreground/30 text-[10px] select-none w-5 text-right font-mono">{item.line}</span>
              <span className={`${item.color} font-medium tracking-wide`}>{item.text}</span>
            </div>
          ))}
          {visibleLineCount < codeLines.length && (
            <span className="inline-block w-2 h-4 bg-primary ml-8 animate-pulse align-middle" />
          )}
        </div>

        {/* Rendered Formula Preview Badge */}
        <AnimatePresence>
          {visibleLineCount === codeLines.length && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between bg-primary/5 p-2.5 rounded-xl"
            >
              <span className="text-[10px] font-mono text-foreground/60 uppercase tracking-wider font-semibold">Rendered Preview</span>
              <div className="px-3 py-1 bg-background border border-border/80 rounded-lg shadow-sm font-serif text-sm text-foreground italic">
                R = [ cosθ -sinθ ; sinθ cosθ ]
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </LiquidGlassCard>
    </div>
  );
}

export function Step2EveAiCanvas() {
  const [typedMessage, setTypedMessage] = useState("");
  const fullMessage = "I have drafted the TikZ coordinate diagram and auto-linked 3 BibTeX references to your project.";

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullMessage.length) {
        setTypedMessage(fullMessage.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 25);
    return () => clearInterval(interval);
  }, []);

  return (
    <LiquidGlassCard className="w-full max-w-xl border-border/60 bg-background/95 p-4 shadow-2xl backdrop-blur-xl relative overflow-hidden space-y-3">
      {/* User Message Bubble */}
      <div className="flex justify-end">
        <div className="bg-primary/10 border border-primary/20 text-foreground text-xs px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-[85%] font-light">
          Eve, draft a TikZ diagram for this rotation matrix and sync my references.
        </div>
      </div>

      {/* Eve Assistant Message Bubble */}
      <div className="flex items-start gap-2.5 pt-1">
        <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground font-bold text-[10px] flex items-center justify-center shrink-0 shadow-sm">
          EVE
        </div>
        <div className="flex-1 space-y-2.5">
          <div className="bg-foreground/5 border border-border/60 p-3 rounded-2xl rounded-tl-xs text-xs text-foreground/90 leading-relaxed font-light">
            {typedMessage}
            {typedMessage.length < fullMessage.length && (
              <span className="inline-block w-1.5 h-3.5 bg-primary ml-1 animate-pulse align-middle" />
            )}
          </div>

          {/* Assistant-UI Tool Calls */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-lg font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>write_file: diagram.tex</span>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-lg font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>bibtex: 3 keys synced</span>
            </div>
          </div>
        </div>
      </div>

      {/* Composer Input Bar */}
      <div className="pt-2 border-t border-border/40 flex items-center gap-2">
        <div className="flex-1 bg-foreground/5 border border-border/60 rounded-xl px-3 py-1.5 text-[11px] text-foreground/40 font-light select-none">
          Ask Eve anything about your LaTeX paper...
        </div>
        <div className="h-7 w-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0 font-bold text-xs select-none">
          ↑
        </div>
      </div>
    </LiquidGlassCard>
  );
}

export function Step3TectonicCompileCanvas() {
  const [compilingTime, setCompilingTime] = useState(0.04);

  useEffect(() => {
    const timer = setInterval(() => {
      setCompilingTime((prev) => (prev < 0.12 ? Number((prev + 0.02).toFixed(2)) : 0.12));
    }, 150);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 w-full max-w-xl">
      {/* Compiler Engine Status HUD */}
      <LiquidGlassCard className="sm:col-span-5 border-border/60 bg-background/95 p-4 flex flex-col justify-between shadow-xl backdrop-blur-xl">
        <div>
          <div className="border-b border-border/50 pb-2 mb-3 text-foreground/60">
            <span className="text-xs font-mono font-semibold">Tectonic Engine</span>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-foreground/50 font-mono uppercase">Compile Time</p>
              <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {compilingTime.toFixed(2)}s
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-foreground/60">
                <span>Progress</span>
                <span>100%</span>
              </div>
              <div className="w-full bg-foreground/10 h-2 rounded-full overflow-hidden">
                <motion.div
                  className="bg-gradient-to-r from-primary to-emerald-400 h-full rounded-full"
                  initial={{ width: "20%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-border/40 mt-4">
          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-medium block text-center">
            0 Errors • 0 Warnings
          </span>
        </div>
      </LiquidGlassCard>

      {/* PDF Document Preview Sheet */}
      <LiquidGlassCard className="sm:col-span-7 border-border/80 bg-white dark:bg-zinc-950 p-4 rounded-2xl shadow-2xl flex flex-col justify-between aspect-[4/3] relative overflow-hidden">
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2 text-between flex justify-between items-center">
          <span className="text-[9px] font-mono text-zinc-400">Journal of Physics (2026)</span>
          <span className="text-[9px] font-mono font-bold text-primary">main.pdf</span>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center gap-2.5 my-3 px-2">
          <div className="h-2 bg-zinc-200 dark:bg-zinc-800 w-3/4 rounded-full" />
          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 w-5/6 rounded-full" />
          <div className="w-full bg-primary/10 border border-primary/30 p-2.5 rounded-xl my-1 flex flex-col items-center justify-center gap-1 shadow-sm">
            <span className="text-[10px] font-serif italic text-primary font-semibold">
              R(θ) = [ cos(θ)  -sin(θ) ;  sin(θ)  cos(θ) ]
            </span>
          </div>
          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 w-2/3 rounded-full" />
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-1.5 flex justify-between items-center text-[9px] font-mono text-zinc-400">
          <span>Page 1 of 1</span>
          <span>Tectonic WASM</span>
        </div>
      </LiquidGlassCard>
    </div>
  );
}

export function Step4ExportShareCanvas() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
      {/* Publication Export Card */}
      <LiquidGlassCard className="border-border/60 bg-background/95 p-5 flex flex-col justify-between shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between mb-4">
          <span className="text-[10px] font-mono font-semibold text-primary uppercase tracking-wider">PDF Export</span>
          <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
            arXiv Ready
          </span>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground">Export PDF</h4>
          <p className="text-xs text-foreground/60 mt-1 leading-relaxed">
            Publication-ready typeset document compiled with embedded fonts and bib entries.
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
          <span className="text-[11px] font-mono text-foreground/50">2.4 MB PDF</span>
          <button type="button" className="text-xs bg-primary text-primary-foreground px-3.5 py-1.5 rounded-lg font-medium shadow-md hover:bg-primary/90 transition-colors">
            Download
          </button>
        </div>
      </LiquidGlassCard>

      {/* Live Co-Author Sandbox Card */}
      <LiquidGlassCard className="border-border/60 bg-background/95 p-5 flex flex-col justify-between shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between mb-4">
          <span className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Collaboration</span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
            Live Sandbox
          </span>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground">Collaborate Live</h4>
          <p className="text-xs text-foreground/60 mt-1 leading-relaxed">
            Real-time co-authoring with instant document synchronization.
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              <div className="h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-blue-600 to-indigo-500 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                AT
              </div>
              <div className="h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-emerald-600 to-teal-500 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                ER
              </div>
              <div className="h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-purple-600 to-pink-500 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                MK
              </div>
            </div>
            <span className="text-[11px] text-foreground/70 font-medium font-mono">3 Active</span>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </LiquidGlassCard>
    </div>
  );
}
