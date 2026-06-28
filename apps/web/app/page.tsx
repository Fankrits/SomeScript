import Link from "next/link";
import { Sparkles, ArrowRight, Code, FileText, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.08),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(168,85,247,0.05),transparent_50%)] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-zinc-950/80 border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="font-bold text-white text-lg">S</span>
          </div>
          <span className="font-semibold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-50 to-zinc-400">
            SomeScript
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-zinc-50 transition-colors">
            Dashboard
          </Link>
          <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-600/10">
            <Link href="/dashboard">
              Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative py-20 lg:py-32">
        <div className="max-w-4xl text-center flex flex-col items-center gap-8">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/5 text-indigo-400 text-xs font-semibold tracking-wide animate-pulse">
            <Sparkles className="h-3.5 w-3.5" />
            Introducing the v0 for LaTeX
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight max-w-3xl">
            Create LaTeX Documents
            <span className="block mt-2 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              at the speed of thought.
            </span>
          </h1>

          {/* Paragraph */}
          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl font-light leading-relaxed">
            Describe what you need, write code, or let the integrated AI assistant generate, restructure, and compile beautiful LaTeX papers in real-time.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center mt-4">
            <Button asChild size="lg" className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-6 rounded-2xl text-base shadow-lg shadow-indigo-600/20 transition-all font-semibold">
              <Link href="/dashboard">
                Start Writing Free <ChevronRight className="ml-1.5 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 text-zinc-300 px-8 py-6 rounded-2xl text-base font-semibold">
              <Link href="/dashboard">
                Sign In
              </Link>
            </Button>
          </div>
        </div>

        {/* Feature Grid / Visual Mockup */}
        <section className="mt-20 lg:mt-32 max-w-5xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          <div className="p-6 rounded-2xl border border-zinc-900 bg-zinc-900/20 backdrop-blur-sm flex flex-col gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Code className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-lg">AI Generation</h3>
            <p className="text-sm text-zinc-400 leading-relaxed font-light">
              Prompt for document outlines, complex math environments, tables, or bibliographies and watch them build instantly.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-zinc-900 bg-zinc-900/20 backdrop-blur-sm flex flex-col gap-4">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-lg">Tectonic Compilation</h3>
            <p className="text-sm text-zinc-400 leading-relaxed font-light">
              Fast, on-demand compilation that runs on high-speed servers and outputs premium PDF formats directly in your browser.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-zinc-900 bg-zinc-900/20 backdrop-blur-sm flex flex-col gap-4">
            <div className="h-10 w-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-lg">Workspace Isolation</h3>
            <p className="text-sm text-zinc-400 leading-relaxed font-light">
              Organize your documents under professional workspaces (powered by Clerk) for simple collaboration and document history.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4 mt-auto">
        <span className="font-light">© 2026 SomeScript. All rights reserved.</span>
        <div className="flex gap-6">
          <a href="#" className="hover:text-zinc-300">Terms</a>
          <a href="#" className="hover:text-zinc-300">Privacy</a>
          <a href="#" className="hover:text-zinc-300">Docs</a>
        </div>
      </footer>
    </div>
  );
}
