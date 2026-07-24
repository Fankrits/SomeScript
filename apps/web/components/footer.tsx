"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Send } from "lucide-react";

type IconProps = { className?: string };

const XIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const GithubIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const LinkedinIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
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
              {[
                { href: "https://twitter.com", label: "X", Icon: XIcon },
                { href: "https://github.com", label: "GitHub", Icon: GithubIcon },
                { href: "https://linkedin.com", label: "LinkedIn", Icon: LinkedinIcon },
              ].map(({ href, label, Icon }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/25 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>

          {/* Product */}
          <div className="md:col-span-2 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Product</h4>
            <ul className="space-y-2.5 text-sm text-white/60 font-light">
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Visual Editor</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-white transition-colors">Tectonic Compiler</Link></li>
              <li><Link href="/#features" className="hover:text-white transition-colors">AI Co-author</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Pricing Plans</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div className="md:col-span-2 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Resources</h4>
            <ul className="space-y-2.5 text-sm text-white/60 font-light">
              <li><Link href="/#faq" className="hover:text-white transition-colors">Documentation</Link></li>
              <li><Link href="/#faq" className="hover:text-white transition-colors">Help Center</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-white transition-colors">Changelog</Link></li>
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
