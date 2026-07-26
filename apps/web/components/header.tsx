"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header({ dark = false }: { dark?: boolean }) {
  return (
    <header className="sticky top-0 z-50 bg-transparent px-6 flex h-[72px] items-center justify-between">
      <Link href="/" className="flex items-center gap-1.5 hover:opacity-90 transition-opacity">
        <Image src="/logo.svg" alt="SomeScript Logo" width={36} height={36} className="h-9 w-9 -mr-1.5" />
        <span className={`font-semibold text-lg tracking-tight ${dark ? "text-white" : "text-foreground"}`}>
          SomeScript
        </span>
      </Link>

      <div className="flex items-center gap-6">
        <Link href="/dashboard" className={`text-sm font-medium transition-colors ${dark ? "text-white/70 hover:text-white" : "text-foreground/70 hover:text-foreground"}`}>
          Dashboard
        </Link>
        <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-all shadow-md shadow-primary/10">
          <Link href="/dashboard">
            Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
