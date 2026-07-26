"use client";

import React, { useState } from "react";
import HeroBackground from "@/components/hero-background";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";
import { cn } from "@/lib/utils";

type LegalTab = "terms" | "privacy" | "security";

export default function LegalPage() {
  const [activeTab, setActiveTab] = useState<LegalTab>("privacy");

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 relative overflow-hidden">
      {/* Dynamic Background and Header */}
      <HeroBackground />
      <Header />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative w-full z-10 py-12 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-medium font-serif tracking-tight text-foreground mb-4">
            Legal & Compliance
          </h1>
          <p className="text-muted-foreground text-sm md:text-base font-light max-w-xl mx-auto">
            Read our terms of service, privacy practices, and security guidelines.
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-2 justify-center mb-6">
          {(["privacy", "terms", "security"] as LegalTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-semibold tracking-wider uppercase transition-all duration-300 border cursor-pointer",
                activeTab === tab
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-secondary/60"
              )}
            >
              {tab === "privacy" && "Privacy Policy"}
              {tab === "terms" && "Terms of Service"}
              {tab === "security" && "Security Policy"}
            </button>
          ))}
        </div>

        <LiquidGlassCard
          glassSize="default"
          className="border-border bg-card/80 backdrop-blur-md rounded-xl p-8 text-card-foreground shadow-lg space-y-6"
        >
          {activeTab === "privacy" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-medium font-serif text-primary border-b border-border pb-3">
                Privacy Policy
              </h2>
              <p className="text-xs text-muted-foreground">Last Updated: July 11, 2026</p>
              
              <div className="space-y-4 text-foreground/80 font-light text-sm leading-relaxed">
                <p>
                  At SomeScript, we are committed to protecting the intellectual property and personal data of the research community. This Privacy Policy describes how we collect, use, and share information when you use our LaTeX editor platforms.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">1. Information We Collect</h3>
                <p>
                  We collect account registration details (such as names and email addresses handled via Clerk authentication) and the files, text, bibliography metadata, and compilation assets you upload or create inside your workspace sandboxes.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">2. How We Use Document Content</h3>
                <p>
                  Document content (your `.tex` and `.bib` files) is used solely to provide visual editing capabilities, AI co-authoring suggestions through Eve, and server-side PDF typesetting. We do not inspect, publish, or sell your research content or metadata.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">3. Data Sharing & Security</h3>
                <p>
                  We restrict access to your workspace documents using secure isolation protocols (such as distinct Git directories scoped per user). We share data only with infrastructure components required for rendering documents (such as hosting and LLM interfaces) under strict confidentiality agreements.
                </p>
              </div>
            </div>
          )}

          {activeTab === "terms" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-medium font-serif text-primary border-b border-border pb-3">
                Terms of Service
              </h2>
              <p className="text-xs text-muted-foreground">Last Updated: July 11, 2026</p>

              <div className="space-y-4 text-foreground/80 font-light text-sm leading-relaxed">
                <p>
                  Welcome to SomeScript. By accessing or using our websites, APIs, and editor environments, you agree to comply with and be bound by these Terms of Service.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">1. Use of Service</h3>
                <p>
                  You agree to use our compilation services only for lawful academic, personal, or corporate document drafting. You must not attempt to execute malicious binaries, bypass sandbox limitations, or perform directory traversal on our Tectonic compilation servers.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">2. Intellectual Property Rights</h3>
                <p>
                  You retain full, exclusive ownership of all manuscripts, math expressions, and research documents you compose. SomeScript does not claim ownership or rights to any publication content created in your workspaces.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">3. Limitation of Liability</h3>
                <p>
                  Services are provided &ldquo;as is&rdquo;. While we aim for maximum uptime and precise typesetting rendering, SomeScript shall not be held liable for any loss of research data, compilation delays, or missed submission deadlines.
                </p>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-medium font-serif text-primary border-b border-border pb-3">
                Security & Data Safeguards
              </h2>
              <p className="text-xs text-muted-foreground">Last Updated: July 11, 2026</p>

              <div className="space-y-4 text-foreground/80 font-light text-sm leading-relaxed">
                <p>
                  SomeScript implements institutional-grade security safeguards to defend our compilation nodes, databases, and user workspaces.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">1. Isolated Compilation Sandboxes</h3>
                <p>
                  Tectonic compilation subprocesses run in isolated sandbox structures. Absolute paths are parsed and resolved using strict verification policies (`getProjectPath()`) to lock compiler actions exclusively within your project directories.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">2. Encryption</h3>
                <p>
                  All connections are encrypted in transit using TLS 1.3, and database elements are secured at rest using cryptographic practices.
                </p>
                <h3 className="text-base font-serif font-semibold text-foreground mt-4">3. Reporting Vulnerabilities</h3>
                <p>
                  If you discover a security vulnerability in our platform or compiler, please report it immediately to our security handlers at <a href="mailto:contact@fankrits.com" className="text-primary hover:underline font-medium">contact@fankrits.com</a>.
                </p>
              </div>
            </div>
          )}
        </LiquidGlassCard>
      </main>

      {/* Shared Footer Component */}
      <Footer />
    </div>
  );
}
