"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import HeroBackground from "@/components/hero-background";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";
import { Award, Compass, Users } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 relative overflow-hidden">
      {/* Dynamic Background and Header */}
      <HeroBackground />
      <Header />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative w-full z-10 py-12 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-medium font-serif tracking-tight text-white mb-4">
            About SomeScript
          </h1>
          <p className="text-white/70 text-sm md:text-base font-light max-w-xl mx-auto">
            Our mission is to remove formatting friction from scientific publishing.
          </p>
        </div>

        <LiquidGlassCard
          glassSize="default"
          className="border-white/10 bg-[#0e161b]/40 backdrop-blur-md rounded-xl p-8 space-y-8 text-white"
        >
          {/* Mission statement */}
          <div className="space-y-4">
            <h2 className="text-2xl font-medium font-serif text-[#dd7e21]">
              Typesetting for the Next Century
            </h2>
            <p className="text-white/80 font-light text-sm md:text-base leading-relaxed">
              Writing research is hard enough. Manually compiling PDF packages, aligning matrices, and debugging missing bibtex citation links shouldn't add to the burden. 
              SomeScript is a modern, collaborative LaTeX environment combining a visual editor with instant cloud Tectonic compilation and context-aware AI tools. We help researchers submit to journals faster, with absolute layout perfection.
            </p>
          </div>

          {/* Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-white/10">
            <div className="space-y-2">
              <Compass className="h-6 w-6 text-[#dd7e21]" />
              <h3 className="text-base font-medium font-serif">Our Vision</h3>
              <p className="text-xs text-white/70 font-light leading-relaxed">
                An intuitive workspace that simplifies the distance between a scientific idea and a camera-ready PDF.
              </p>
            </div>
            <div className="space-y-2">
              <Users className="h-6 w-6 text-[#dd7e21]" />
              <h3 className="text-base font-medium font-serif">Collaborative</h3>
              <p className="text-xs text-white/70 font-light leading-relaxed">
                Isolated sandboxes with git worktrees mean authors co-write in real time without merge conflicts.
              </p>
            </div>
            <div className="space-y-2">
              <Award className="h-6 w-6 text-[#dd7e21]" />
              <h3 className="text-base font-medium font-serif">AI-First</h3>
              <p className="text-xs text-white/70 font-light leading-relaxed">
                Automated outline generation, citation lookup, and error correction right at your cursor.
              </p>
            </div>
          </div>

          <div className="pt-6 text-center">
            <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-5 rounded-lg text-sm transition-all shadow-md shadow-primary/10 cursor-pointer">
              <Link href="/dashboard">
                Start Typesetting Now
              </Link>
            </Button>
          </div>
        </LiquidGlassCard>
      </main>

      {/* Shared Footer Component */}
      <Footer />
    </div>
  );
}
