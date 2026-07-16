"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";

export default function Footer() {
  return (
    <footer className="w-full max-w-7xl mx-auto px-6 pb-12 mt-12 z-10">
      <LiquidGlassCard
        glassSize="default"
        className="border-white/10 bg-[#0e161b]/40 backdrop-blur-md rounded-xl p-8 md:p-12 text-white"
      >
        {/* Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 pb-10 border-b border-white/10">
          {/* Branding Column */}
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-1.5 hover:opacity-90 transition-opacity">
              <Image src="/logo.svg" alt="SomeScript Logo" width={32} height={32} className="h-8 w-8" />
              <span className="font-semibold text-base tracking-tight text-white">
                SomeScript
              </span>
            </Link>
            <p className="text-white/70 text-xs md:text-sm font-light max-w-sm leading-relaxed">
              Your AI-powered LaTeX co-author. Write, compile, and publish flawless research papers and scientific documents instantly.
            </p>
            <div className="text-[11px] text-white/40">
              Research Deserves Perfection.
            </div>
          </div>

          {/* Links Columns */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#dd7e21]">Product</h4>
            <ul className="space-y-2 text-xs text-white/60 font-light">
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Visual Editor</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-white transition-colors">Tectonic Compiler</Link></li>
              <li><Link href="/#features" className="hover:text-white transition-colors">AI Co-author</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Pricing Plans</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#dd7e21]">Resources</h4>
            <ul className="space-y-2 text-xs text-white/60 font-light">
              <li><Link href="/#faq" className="hover:text-white transition-colors">Documentation</Link></li>
              <li><Link href="/#faq" className="hover:text-white transition-colors">Help Center</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-white transition-colors">Changelog</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#dd7e21]">Company</h4>
            <ul className="space-y-2 text-xs text-white/60 font-light">
              <li><Link href="/about" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link href="/#features" className="hover:text-white transition-colors">Research Blog</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">Careers</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-white/50 gap-4">
          <span className="font-light text-left">
            © 2026 SomeScript Inc. Built for researchers globally.
          </span>
          <div className="flex gap-6 font-light">
            <Link href="/legal" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/legal" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/legal" className="hover:text-white transition-colors">Security</Link>
          </div>
        </div>
      </LiquidGlassCard>
    </footer>
  );
}
