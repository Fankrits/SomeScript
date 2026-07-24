"use client";

import React from "react";
import { Timeline } from "@/components/ui/timeline";
import { PenLine, Sparkles, FileCheck2, Download, Terminal, CheckCircle2, Share2 } from "lucide-react";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";

export function HowItWorks() {
  const data = [
    {
      title: "01. Write & Prompt",
      content: (
        <div className="max-w-2xl">
          <p className="text-foreground/80 font-light text-sm md:text-base leading-relaxed mb-6">
            Start typing standard LaTeX directly, or describe what you need in plain English. SomeScript supports standard document classes and math environments natively.
          </p>
          <LiquidGlassCard className="border-white/10 bg-[#0e161b]/30 backdrop-blur-sm p-4 font-mono text-xs text-white/90">
            <div className="flex items-center gap-1.5 border-b border-white/10 pb-2 mb-3 text-white/40">
              <Terminal className="h-3.5 w-3.5" />
              <span>input_prompt.tex</span>
            </div>
            <div className="space-y-1 text-white/80">
              <p className="text-white/40">{"// Prompt: Write a matrix equation representing a 2D rotation"}</p>
              <p><span className="text-[#c3c4f9]">\begin</span>&#123;equation&#125;</p>
              <p className="pl-4 text-[#8cedc4]">R = \begin&#123;pmatrix&#125; \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end&#123;pmatrix&#125;</p>
              <p><span className="text-[#c3c4f9]">\end</span>&#123;equation&#125;</p>
            </div>
          </LiquidGlassCard>
        </div>
      ),
    },
    {
      title: "02. AI Co-Authoring",
      content: (
        <div className="max-w-2xl">
          <p className="text-foreground/80 font-light text-sm md:text-base leading-relaxed mb-6">
            Our embedded AI co-author, Eve, processes your requests and instantly generates outline structures, complex mathematical formulas, formatted tables, and structured bibliographies.
          </p>
          <LiquidGlassCard className="border-white/10 bg-[#0e161b]/30 backdrop-blur-sm p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-white">Eve AI Assistant</p>
                <p className="text-xs text-white/70 leading-relaxed bg-white/5 border border-white/5 p-3 rounded-lg">
                  &ldquo;I have drafted the TikZ coordinate diagram and populated the bibliography keys from your Mendeley imports.&rdquo;
                </p>
                <div className="flex gap-2">
                  <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> TikZ Code Generated
                  </span>
                  <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> bibtex keys synced
                  </span>
                </div>
              </div>
            </div>
          </LiquidGlassCard>
        </div>
      ),
    },
    {
      title: "03. Instant Compile",
      content: (
        <div className="max-w-2xl">
          <p className="text-foreground/80 font-light text-sm md:text-base leading-relaxed mb-6">
            The background Tectonic engine compiles your project on-the-fly. The visual editor updates in real time with page-accurate previews of math, layout, and images as you type.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <LiquidGlassCard className="border-white/10 bg-[#0e161b]/30 backdrop-blur-sm p-4 flex flex-col justify-center items-center text-center">
              <FileCheck2 className="h-8 w-8 text-primary mb-2 animate-pulse" />
              <span className="text-xs font-medium text-white">Tectonic Compiler</span>
              <span className="text-[10px] text-white/50 mt-1">Status: Success (0.12s)</span>
            </LiquidGlassCard>
            <LiquidGlassCard className="border-white/10 bg-white/95 p-4 rounded-xl shadow-lg flex flex-col justify-between aspect-[4/3]">
              <div className="border-b border-[#e5dacd] pb-1.5 text-center">
                <span className="text-[8px] font-bold text-[#0f4c5c]">main.pdf</span>
              </div>
              <div className="flex-1 flex flex-col justify-center items-center gap-1.5 my-2">
                <div className="h-1 bg-[#efe7dd] w-3/4 rounded" />
                <div className="h-1 bg-[#efe7dd] w-5/6 rounded" />
                <div className="h-1.5 bg-[#0f4c5c]/10 border border-[#0f4c5c]/20 w-1/2 rounded my-1" />
              </div>
              <div className="h-1 bg-[#efe7dd] w-1/3 rounded" />
            </LiquidGlassCard>
          </div>
        </div>
      ),
    },
    {
      title: "04. Export & Share",
      content: (
        <div className="max-w-2xl">
          <p className="text-foreground/80 font-light text-sm md:text-base leading-relaxed mb-6">
            Download your final typeset, publication-ready PDF document, or invite your co-authors and research collaborators to join your shared isolated sandboxes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <LiquidGlassCard className="flex-1 border-white/10 bg-[#0e161b]/30 backdrop-blur-sm p-4 flex items-center gap-3">
              <Download className="h-5 w-5 text-[#dd7e21]" />
              <div>
                <p className="text-xs font-semibold text-white">Download PDF</p>
                <p className="text-[10px] text-white/60">Ready for arXiv submission</p>
              </div>
            </LiquidGlassCard>
            <LiquidGlassCard className="flex-1 border-white/10 bg-[#0e161b]/30 backdrop-blur-sm p-4 flex items-center gap-3">
              <Share2 className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-xs font-semibold text-white">Invite Collaborators</p>
                <p className="text-[10px] text-white/60">Configured with git worktrees</p>
              </div>
            </LiquidGlassCard>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="w-full max-w-7xl mx-auto px-6 py-12 relative z-10 border-t border-border/40">
      <div className="text-center mb-6">
        <h2 className="text-3xl sm:text-4xl font-medium font-serif tracking-tight text-foreground">
          How It Works
        </h2>
        <p className="mt-3 text-sm sm:text-base text-foreground/70 font-light max-w-xl mx-auto">
          From prompt or scratch draft to a publication-ready PDF in minutes.
        </p>
      </div>

      <Timeline data={data} />
    </section>
  );
}
