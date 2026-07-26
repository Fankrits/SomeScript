"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, Send } from "lucide-react";

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M7.75 2h8.5A5.76 5.76 0 0122 7.75v8.5A5.76 5.76 0 0116.25 22h-8.5A5.76 5.76 0 012 16.25v-8.5A5.76 5.76 0 017.75 2zm0 2A3.75 3.75 0 004 7.75v8.5A3.75 3.75 0 007.75 20h8.5A3.75 3.75 0 0020 16.25v-8.5A3.75 3.75 0 0016.25 4h-8.5zM12 7a5 5 0 110 10 5 5 0 010-10zm0 2a3 3 0 100 6 3 3 0 000-6zm5.25-3.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5z" />
  </svg>
);

export default function Footer() {
  return (
    <footer className="w-full bg-[#0e161b] text-white z-10">
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-10">
        {/* Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-white/10">
          {/* Branding Column */}
          <div className="md:col-span-4 space-y-5">
            <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <Image src="/logo.svg" alt="SomeScript Logo" width={36} height={36} className="h-9 w-9" />
              <span className="font-semibold text-xl tracking-tight text-white">
                SomeScript
              </span>
            </Link>
            <p className="text-white/60 text-sm font-light max-w-xs leading-relaxed">
              Bridging the gap between raw manuscripts and prestigious academic publications with AI-driven rigor.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://www.instagram.com/fankrits/"
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="inline-flex text-white/60 transition-colors hover:text-white"
              >
                <InstagramIcon className="h-5 w-5" />
              </a>
              <a
                href="mailto:contact@fankrits.com"
                aria-label="Email contact@fankrits.com"
                className="inline-flex text-white/60 transition-colors hover:text-white"
              >
                <Mail className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div className="md:col-span-2 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Product</h4>
            <ul className="space-y-2.5 text-sm text-white/60 font-light">
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Visual Editor</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div className="md:col-span-2 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Resources</h4>
            <ul className="space-y-2.5 text-sm text-white/60 font-light">
              <li><Link href="/#faq" className="hover:text-white transition-colors">Documentation</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">About Us</Link></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="md:col-span-4 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Stay Updated</h4>
            <p className="text-sm text-white/60 font-light">
              Subscribe to our newsletter for the latest updates.
            </p>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex items-center gap-2 max-w-sm"
            >
              <input
                type="email"
                required
                placeholder="Enter your email"
                aria-label="Email address"
                className="flex-1 h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 transition-colors"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-white/40 gap-4">
          <span className="font-light text-center sm:text-left">
            © 2026 SomeScript Inc. All rights reserved.
          </span>
          <div className="flex gap-6 font-light">
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <Link href="/legal" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/legal" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
