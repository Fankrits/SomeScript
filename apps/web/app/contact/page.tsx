"use client";

import React from "react";
import HeroBackground from "@/components/hero-background";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";
import { Mail, MessageSquare, ShieldAlert } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 relative overflow-hidden">
      {/* Dynamic Background and Header */}
      <HeroBackground />
      <Header />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative w-full z-10 py-12 px-6 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-medium font-serif tracking-tight text-foreground mb-4">
            Contact Us
          </h1>
          <p className="text-muted-foreground text-sm md:text-base font-light max-w-xl mx-auto">
            Have questions or need assistance? Reach out to our academic support team.
          </p>
        </div>

        <LiquidGlassCard
          glassSize="default"
          className="border-border bg-card/80 backdrop-blur-md rounded-xl p-8 space-y-8 text-card-foreground shadow-lg"
        >
          <div className="space-y-6">
            <h2 className="text-2xl font-medium font-serif text-primary">Get in Touch</h2>
            <p className="text-foreground/80 font-light text-sm md:text-base leading-relaxed">
              We look forward to hearing from you. Whether you are a student, professor, or part of
              an institutional research lab, we are here to support your LaTeX authoring experience.
            </p>
          </div>

          {/* Contact Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
            {/* Primary Email */}
            <div className="flex items-start gap-4 p-4 rounded-lg bg-secondary/40 border border-border">
              <Mail className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">General & Support Email</h3>
                <a
                  href="mailto:contact@fankrits.com"
                  className="text-xs text-primary hover:underline block font-medium"
                >
                  contact@fankrits.com
                </a>
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed font-light">
                  We typical respond within 12–24 business hours.
                </p>
              </div>
            </div>

            {/* Support / Partnerships */}
            <div className="flex items-start gap-4 p-4 rounded-lg bg-secondary/40 border border-border">
              <MessageSquare className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Enterprise & Labs</h3>
                <p className="text-xs text-muted-foreground font-light">
                  For university site licenses, department packages, or custom Tectonic hosting:
                </p>
                <a
                  href="mailto:contact@fankrits.com"
                  className="text-xs text-primary hover:underline font-medium"
                >
                  contact@fankrits.com
                </a>
              </div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-400" />
            <p className="text-xs font-light leading-relaxed">
              <strong>Security Notice:</strong> Please do not submit confidential manuscript drafts
              or sensitive API keys via general support emails. Always keep credentials private.
            </p>
          </div>
        </LiquidGlassCard>
      </main>

      {/* Shared Footer Component */}
      <Footer />
    </div>
  );
}
