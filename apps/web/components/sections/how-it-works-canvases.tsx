"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Terminal,
  Sparkles,
  CheckCircle2,
  FileCheck2,
  Download,
  Share2,
  Cpu,
  FileText,
  UserCheck,
  Zap,
  Code2,
} from "lucide-react";
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
        <div className="h-6 w-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
        </div>
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
            <Terminal className="h-3.5 w-3.5 text-primary" />
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
  const fullMessage = "I have drafted the TikZ coordinate vector diagram and auto-synced 3 BibTeX references from your Mendeley imports.";

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
    <LiquidGlassCard className="w-full max-w-xl border-border/60 bg-background/95 p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden">
      {/* Ambient Neural Glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Eve AI Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-emerald-500/20 border border-primary/40 flex items-center justify-center text-primary shadow-inner">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full animate-ping" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Eve AI Co-Author</h4>
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                Active Agent
              </span>
            </div>
            <p className="text-[11px] text-foreground/50 font-mono">v2.4 • Tectonic AI Engine</p>
          </div>
        </div>
        <Zap className="h-4 w-4 text-amber-500" />
      </div>

      {/* Streaming Message Body */}
      <div className="space-y-3">
        <div className="bg-foreground/5 border border-border/60 p-3.5 rounded-xl">
          <p className="text-xs text-foreground/90 leading-relaxed font-light font-sans">
            &ldquo;{typedMessage}&rdquo;
            {typedMessage.length < fullMessage.length && (
              <span className="inline-block w-1.5 h-3.5 bg-primary ml-1 animate-pulse align-middle" />
            )}
          </p>
        </div>

        {/* Asset Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl flex items-center gap-2.5">
            <Code2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">TikZ Vector Code</p>
              <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70">Generated 2D Axis</p>
            </div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-xl flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">BibTeX Synced</p>
              <p className="text-[9px] text-blue-600/70 dark:text-blue-400/70">3 Keys Auto-linked</p>
            </div>
          </div>
        </div>

        {/* Action Shortcut Badge */}
        <div className="flex justify-end pt-2">
          <span className="text-[10px] font-mono bg-foreground/10 text-foreground/70 px-2.5 py-1 rounded-lg border border-border">
            Press <kbd className="font-bold text-foreground">Tab</kbd> to Accept Draft
          </span>
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
          <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-3 text-foreground/60">
            <Cpu className="h-4 w-4 text-primary" />
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
          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-medium flex items-center justify-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> 0 Errors • 0 Warnings
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
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
            <Download className="h-6 w-6" />
          </div>
          <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
            arXiv Ready
          </span>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground">Export PDF</h4>
          <p className="text-xs text-foreground/60 mt-1 leading-relaxed">
            Publication-ready typeset document compiled with embed fonts and bib entries.
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
          <span className="text-[11px] font-mono text-foreground/50">2.4 MB PDF</span>
          <button type="button" className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium shadow-md hover:bg-primary/90 transition-colors">
            Download
          </button>
        </div>
      </LiquidGlassCard>

      {/* Live Co-Author Sandbox Card */}
      <LiquidGlassCard className="border-border/60 bg-background/95 p-5 flex flex-col justify-between shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between mb-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
            <Share2 className="h-6 w-6" />
          </div>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
            Live Sandbox
          </span>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground">Collaborate Live</h4>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex -space-x-2 overflow-hidden">
              <div className="inline-block h-6 w-6 rounded-full ring-2 ring-background bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">AT</div>
              <div className="inline-block h-6 w-6 rounded-full ring-2 ring-background bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center">ER</div>
            </div>
            <span className="text-xs text-foreground/70 font-medium">2 Active Collaborators</span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <UserCheck className="h-3 w-3" /> Worktree Synced
          </span>
          <span className="text-[10px] font-mono text-foreground/40">git-worktree</span>
        </div>
      </LiquidGlassCard>
    </div>
  );
}
