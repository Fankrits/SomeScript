"use client";

import React, { useRef, useState } from "react";
import { useScroll, useMotionValueEvent, motion, AnimatePresence } from "motion/react";
import {
  Step1WritePromptCanvas,
  Step2TectonicCompileCanvas,
  Step3ExportShareCanvas,
} from "./how-it-works-canvases";

const steps = [
  {
    number: "01",
    title: "Prompt & Co-Author",
    description: "Type LaTeX directly or describe what you need in plain English. Our AI Agent processes your requests to instantly generate formulas, TikZ diagrams, and structured document code.",
    canvas: <Step1WritePromptCanvas />,
  },
  {
    number: "02",
    title: "Instant Compile",
    description: "The background Tectonic engine compiles your project on-the-fly. The visual editor updates in real time with page-accurate previews of math, layout, and images as you type.",
    canvas: <Step2TectonicCompileCanvas />,
  },
  {
    number: "03",
    title: "Export & Share",
    description: "Download your final typeset, publication-ready PDF document, or invite your co-authors and research collaborators to join your shared isolated sandboxes.",
    canvas: <Step3ExportShareCanvas />,
  },
];

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.33) {
      setActiveStep(0);
    } else if (latest < 0.66) {
      setActiveStep(1);
    } else {
      setActiveStep(2);
    }
  });

  const handleStepClick = (idx: number) => {
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

  return (
    <section id="how-it-works" className="w-full border-t border-border/40 relative z-10">
      {/* Mobile/Tablet Adaptive View (< 1024px) */}
      <div className="block lg:hidden px-4 sm:px-6 py-12 bg-background">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-medium font-serif tracking-tight text-foreground">
            How It Works
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-foreground/70 font-light max-w-xl mx-auto">
            From prompt or scratch draft to a publication-ready PDF in minutes.
          </p>
        </div>

        {/* Step Selector Buttons */}
        <div className="flex gap-2 justify-center mb-6 overflow-x-auto pb-2 scrollbar-none">
          {steps.map((step, idx) => {
            const isActive = activeStep === idx;
            return (
              <button
                key={step.number}
                type="button"
                onClick={() => handleStepClick(idx)}
                className={`px-3 py-2 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-foreground/5 text-foreground/70 hover:bg-foreground/10"
                }`}
              >
                <span className="font-bold">{step.number}</span>
                <span className="font-sans font-medium">{step.title}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Step Description & Interactive Canvas */}
        <div className="flex flex-col gap-6 max-w-2xl mx-auto">
          <div className="p-4 rounded-xl border border-primary/20 bg-foreground/5">
            <h3 className="text-base font-serif font-semibold text-foreground">
              {steps[activeStep].number}. {steps[activeStep].title}
            </h3>
            <p className="mt-1.5 text-xs sm:text-sm text-foreground/80 leading-relaxed font-light">
              {steps[activeStep].description}
            </p>
          </div>

          <div className="w-full flex justify-center overflow-x-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="w-full flex justify-center"
              >
                {steps[activeStep].canvas}
              </motion.div>
            </AnimatePresence>
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

