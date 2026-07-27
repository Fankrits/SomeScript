"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useScroll, useMotionValueEvent, motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Step1WritePromptCanvas,
  Step2TectonicCompileCanvas,
  Step3ExportShareCanvas,
} from "./how-it-works-canvases";

const steps = [
  {
    number: "01",
    title: "Prompt & Co-Author",
    subtitle: "AI Generation",
    description: "Type LaTeX directly or describe what you need in plain English. Our AI Agent processes your requests to instantly generate formulas, TikZ diagrams, and structured document code.",
    canvas: <Step1WritePromptCanvas />,
  },
  {
    number: "02",
    title: "Instant Compile",
    subtitle: "Tectonic Engine",
    description: "The background Tectonic engine compiles your project on-the-fly. The visual editor updates in real time with page-accurate previews of math, layout, and images as you type.",
    canvas: <Step2TectonicCompileCanvas />,
  },
  {
    number: "03",
    title: "Export & Share",
    subtitle: "Publication Ready",
    description: "Download your final typeset, publication-ready PDF document, or invite your co-authors and research collaborators to join your shared isolated sandboxes.",
    canvas: <Step3ExportShareCanvas />,
  },
];

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.33) {
      if (activeStep !== 0) {
        setDirection(0 < activeStep ? -1 : 1);
        setActiveStep(0);
      }
    } else if (latest < 0.66) {
      if (activeStep !== 1) {
        setDirection(1 < activeStep ? -1 : 1);
        setActiveStep(1);
      }
    } else {
      if (activeStep !== 2) {
        setDirection(2 < activeStep ? -1 : 1);
        setActiveStep(2);
      }
    }
  });

  const handleStepClick = (idx: number) => {
    setDirection(idx > activeStep ? 1 : -1);
    setActiveStep(idx);
    if (!containerRef.current) return;
    if (window.innerWidth >= 1024) {
      const container = containerRef.current;
      const containerTop = container.getBoundingClientRect().top + window.scrollY - 72;
      const containerHeight = container.offsetHeight - window.innerHeight;
      const targetY = containerTop + (idx / 2) * containerHeight;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }
  };

  const handlePrev = () => {
    if (activeStep > 0) {
      handleStepClick(activeStep - 1);
    }
  };

  const handleNext = () => {
    if (activeStep < steps.length - 1) {
      handleStepClick(activeStep + 1);
    }
  };

  return (
    <section id="how-it-works" className="w-full border-t border-border/40 relative z-10">
      {/* Mobile/Tablet Redesigned Interactive Stepper View (< 1024px) */}
      <div className="block lg:hidden px-4 sm:px-6 py-12 bg-background overflow-hidden">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Workflow Experience</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-medium font-serif tracking-tight text-foreground">
            How It Works
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-foreground/70 font-light max-w-md mx-auto">
            From prompt or scratch draft to a publication-ready PDF in minutes.
          </p>
        </div>

        {/* Stepper Progress Bar Header */}
        <div className="max-w-md mx-auto mb-6 px-2">
          {/* Connecting Track Line */}
          <div className="relative flex items-center justify-between">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-border z-0" />
            <motion.div
              className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-primary z-0 transition-all duration-300"
              style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
            />

            {/* Step Nodes */}
            {steps.map((step, idx) => {
              const isActive = activeStep === idx;
              const isPassed = activeStep >= idx;
              return (
                <button
                  key={step.number}
                  type="button"
                  onClick={() => handleStepClick(idx)}
                  className={`relative z-10 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full font-mono text-xs font-bold transition-all duration-300 cursor-pointer ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-4 ring-primary/15 scale-110"
                      : isPassed
                      ? "bg-primary/90 text-primary-foreground"
                      : "bg-background border-2 border-border text-foreground/50 hover:border-primary/50"
                  }`}
                >
                  {step.number}
                </button>
              );
            })}
          </div>

          {/* Step Segment Titles below nodes */}
          <div className="flex justify-between mt-2.5 text-[10px] font-mono text-foreground/60 px-1">
            {steps.map((step, idx) => (
              <span
                key={step.number}
                className={`transition-colors ${activeStep === idx ? "text-primary font-bold" : ""}`}
              >
                {step.subtitle}
              </span>
            ))}
          </div>
        </div>

        {/* Step Card Container */}
        <div className="max-w-md mx-auto">
          <div className="bg-background/95 border border-border/80 rounded-2xl shadow-xl p-4 sm:p-5 relative overflow-hidden backdrop-blur-md">
            {/* Step Meta Badge Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border/40 mb-4">
              <div className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground font-mono text-xs font-bold px-2 py-0.5 rounded-md">
                  {steps[activeStep].number}
                </span>
                <span className="text-xs font-mono font-semibold text-primary uppercase tracking-wider">
                  {steps[activeStep].subtitle}
                </span>
              </div>
              <span className="text-[10px] font-mono text-foreground/50 bg-foreground/5 px-2 py-0.5 rounded-md">
                Step {activeStep + 1} of 3
              </span>
            </div>

            {/* Step Animated Body */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={activeStep}
                custom={direction}
                initial={{ opacity: 0, x: direction * 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -30 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-lg font-serif font-bold text-foreground">
                    {steps[activeStep].title}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-foreground/80 leading-relaxed font-light">
                    {steps[activeStep].description}
                  </p>
                </div>

                {/* Stage Canvas */}
                <div className="pt-2 w-full flex justify-center overflow-x-hidden">
                  {steps[activeStep].canvas}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Touch Navigation Controls Footer */}
            <div className="mt-5 pt-3.5 border-t border-border/40 flex items-center justify-between">
              <button
                type="button"
                onClick={handlePrev}
                disabled={activeStep === 0}
                className="flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-opacity py-1.5 px-2.5 rounded-lg hover:bg-foreground/5 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>

              {/* Dot Indicators */}
              <div className="flex gap-1.5">
                {steps.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleStepClick(idx)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      activeStep === idx ? "w-6 bg-primary" : "w-1.5 bg-foreground/20"
                    }`}
                    aria-label={`Go to step ${idx + 1}`}
                  />
                ))}
              </div>

              {activeStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-primary/10 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-md h-8 px-3">
                  <Link href="/dashboard">
                    Try Now <ArrowRight className="ml-1 w-3.5 h-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Sticky Scroll View (>= 1024px) */}
      <div ref={containerRef} className="hidden lg:block relative h-[250vh] bg-background">
        {/* Sticky viewport frame - pinned under 72px Header */}
        <div className="sticky top-[72px] h-[calc(100vh-72px)] flex flex-col justify-center max-w-7xl mx-auto px-6 py-6 overflow-hidden">
          {/* Header */}
          <div className="text-center mb-6 shrink-0">
            <h2 className="text-3xl sm:text-4xl font-medium font-serif tracking-tight text-foreground">
              How It Works
            </h2>
            <p className="mt-2 text-sm sm:text-base text-foreground/70 font-light max-w-xl mx-auto">
              From prompt or scratch draft to a publication-ready PDF in minutes.
            </p>
          </div>

          {/* Main Split Grid */}
          <div className="grid grid-cols-12 gap-8 lg:gap-12 items-center flex-1 max-h-[550px]">
            {/* Left Column: Steps List */}
            <div className="col-span-5 flex flex-col gap-4 justify-center">
              {steps.map((step, idx) => {
                const isActive = activeStep === idx;
                return (
                  <button
                    key={step.number}
                    onClick={() => handleStepClick(idx)}
                    type="button"
                    className={`text-left transition-all duration-300 p-4 rounded-xl border cursor-pointer ${
                      isActive
                        ? "bg-foreground/5 border-primary/30 shadow-md scale-[1.02]"
                        : "bg-transparent border-transparent opacity-40 hover:opacity-75"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        isActive ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-foreground/60"
                      }`}>
                        {step.number}
                      </span>
                      <h3 className="text-lg font-serif font-medium text-foreground">
                        {step.title}
                      </h3>
                    </div>
                    {isActive && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 text-xs sm:text-sm text-foreground/80 leading-relaxed font-light pl-9"
                      >
                        {step.description}
                      </motion.p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right Column: Dynamic Stage Canvas */}
            <div className="col-span-7 flex items-center justify-center min-h-[300px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="w-full flex justify-center"
                >
                  {steps[activeStep].canvas}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

