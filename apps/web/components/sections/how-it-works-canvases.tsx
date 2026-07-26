"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Terminal, Sparkles, CheckCircle2, FileCheck2, Download, Share2 } from "lucide-react";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";

export function Step1WritePromptCanvas() {
  const fullText = "\\begin{equation}\n  R = \\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}\n\\end{equation}";
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setDisplayedText(fullText.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 35);
    return () => clearInterval(interval);
  }, [fullText]);

  return (
    <LiquidGlassCard className="w-full border-border bg-background/90 p-5 font-mono text-xs text-foreground shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2 border-b border-border pb-3 mb-4 text-foreground/50">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground/70">matrix_rotation.tex</span>
      </div>
      <div className="space-y-1.5 text-foreground/90 font-mono leading-relaxed min-h-[140px]">
        <p className="text-foreground/40 font-sans italic mb-2">{"// Prompt: Write a 2D rotation matrix in standard LaTeX"}</p>
        <pre className="whitespace-pre-wrap font-mono text-emerald-600 dark:text-emerald-400">
          {displayedText}
          <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
        </pre>
      </div>
    </LiquidGlassCard>
  );
}

export function Step2EveAiCanvas() {
  return (
    <LiquidGlassCard className="w-full border-border bg-background/90 p-5 shadow-2xl backdrop-blur-md">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0 shadow-inner">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Eve AI Co-Author</p>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Active Assistant</span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed bg-foreground/5 border border-border p-3.5 rounded-xl font-light">
            &ldquo;I have drafted the TikZ coordinate diagram and populated the bibliography keys from your imported references.&rdquo;
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> TikZ Code Generated
            </span>
            <span className="text-[11px] bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> BibTeX Keys Synced
            </span>
          </div>
        </div>
      </div>
    </LiquidGlassCard>
  );
}

export function Step3TectonicCompileCanvas() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
      <LiquidGlassCard className="border-border bg-background/90 p-5 flex flex-col justify-center items-center text-center shadow-xl backdrop-blur-md">
        <FileCheck2 className="h-10 w-10 text-primary mb-3 animate-bounce" />
        <span className="text-sm font-semibold text-foreground">Tectonic Engine</span>
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">Status: Success (0.12s)</span>
        <div className="w-full bg-foreground/10 h-1.5 rounded-full mt-3 overflow-hidden">
          <motion.div 
            className="bg-primary h-full rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </LiquidGlassCard>
      <LiquidGlassCard className="border-border bg-white dark:bg-zinc-950 p-4 rounded-2xl shadow-xl flex flex-col justify-between aspect-[4/3]">
        <div className="border-b border-border pb-2 text-center">
          <span className="text-[10px] font-bold text-primary tracking-wide">main.pdf (Preview)</span>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center gap-2 my-2">
          <div className="h-1.5 bg-foreground/10 w-3/4 rounded-full" />
          <div className="h-1.5 bg-foreground/10 w-5/6 rounded-full" />
          <div className="h-6 bg-primary/10 border border-primary/20 w-3/4 rounded-lg my-1 flex items-center justify-center px-2">
            <span className="text-[8px] font-mono text-primary font-semibold">R = [ cosθ -sinθ ; sinθ cosθ ]</span>
          </div>
        </div>
        <div className="h-1.5 bg-foreground/10 w-1/3 rounded-full self-start" />
      </LiquidGlassCard>
    </div>
  );
}

export function Step4ExportShareCanvas() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full">
      <LiquidGlassCard className="flex-1 border-border bg-background/90 p-5 flex items-center gap-4 shadow-xl backdrop-blur-md">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
          <Download className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Download PDF</p>
          <p className="text-xs text-foreground/60 mt-0.5">arXiv & IEEE compliant</p>
        </div>
      </LiquidGlassCard>
      <LiquidGlassCard className="flex-1 border-border bg-background/90 p-5 flex items-center gap-4 shadow-xl backdrop-blur-md">
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
          <Share2 className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Invite Collaborators</p>
          <p className="text-xs text-foreground/60 mt-0.5">Live multi-user sandboxes</p>
        </div>
      </LiquidGlassCard>
    </div>
  );
}
