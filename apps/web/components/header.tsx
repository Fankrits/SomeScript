"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header({ dark = false }: { dark?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 px-4 sm:px-6 transition-all duration-300 flex h-[68px] sm:h-[72px] items-center justify-between ${
        scrolled
          ? "bg-background/85 backdrop-blur-md border-b border-border/40 shadow-xs"
          : "bg-transparent"
      }`}
    >
      <Link href="/" className="flex items-center gap-1.5 hover:opacity-90 transition-opacity">
        <Image
          src="/logo.svg"
          alt="SomeScript Logo"
          width={36}
          height={36}
          className="h-8 w-8 sm:h-9 sm:w-9 -mr-1"
        />
        <span
          className={`font-semibold text-base sm:text-lg tracking-tight ${dark ? "text-white" : "text-foreground"}`}
        >
          SomeScript
        </span>
      </Link>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center gap-6">
        <Link
          href="#features"
          className={`text-xs sm:text-sm font-medium transition-colors ${dark ? "text-white/70 hover:text-white" : "text-foreground/70 hover:text-foreground"}`}
        >
          Features
        </Link>
        <Link
          href="#how-it-works"
          className={`text-xs sm:text-sm font-medium transition-colors ${dark ? "text-white/70 hover:text-white" : "text-foreground/70 hover:text-foreground"}`}
        >
          How it Works
        </Link>
        <a
          href="https://docs.somescript.com"
          target="_blank"
          rel="noreferrer"
          className={`text-xs sm:text-sm font-medium transition-colors ${dark ? "text-white/70 hover:text-white" : "text-foreground/70 hover:text-foreground"}`}
        >
          Docs
        </a>
        <Link
          href="#faq"
          className={`text-xs sm:text-sm font-medium transition-colors ${dark ? "text-white/70 hover:text-white" : "text-foreground/70 hover:text-foreground"}`}
        >
          FAQ
        </Link>
        <Button
          asChild
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-all shadow-md shadow-primary/10"
        >
          <Link href="/dashboard">
            Get Started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </nav>

      {/* Mobile Actions */}
      <div className="flex md:hidden items-center gap-2">
        <Button
          asChild
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-3 py-1.5 h-8 rounded-md font-medium"
        >
          <Link href="/dashboard">Start Free</Link>
        </Button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[68px] bg-background/95 backdrop-blur-xl border-b border-border/40 p-5 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-top-2 duration-200 z-50">
          <Link
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-foreground/80 hover:text-foreground py-2 border-b border-border/30"
          >
            Features
          </Link>
          <Link
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-foreground/80 hover:text-foreground py-2 border-b border-border/30"
          >
            How it Works
          </Link>
          <a
            href="https://docs.somescript.com"
            target="_blank"
            rel="noreferrer"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-foreground/80 hover:text-foreground py-2 border-b border-border/30"
          >
            Docs
          </a>
          <Link
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-foreground/80 hover:text-foreground py-2 border-b border-border/30"
          >
            FAQ
          </Link>
          <Button
            asChild
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg mt-2"
          >
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
              Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </header>
  );
}
