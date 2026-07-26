"use client";

import React, { useRef, useState } from "react";
import { useScroll, useMotionValueEvent, motion, AnimatePresence } from "motion/react";
import {
  Step1WritePromptCanvas,
  Step2EveAiCanvas,
  Step3TectonicCompileCanvas,
  Step4ExportShareCanvas,
} from "./how-it-works-canvases";

const steps = [
  {
    number: "01",
    title: "Write & Prompt",
    description: "Start typing standard LaTeX directly, or describe what you need in plain English. SomeScript supports standard document classes and math environments natively.",
    canvas: <Step1WritePromptCanvas />,
  },
  {
    number: "02",
    title: "AI Co-Authoring",
    description: "Our embedded AI co-author, Eve, processes your requests and instantly generates outline structures, complex mathematical formulas, formatted tables, and structured bibliographies.",
    canvas: <Step2EveAiCanvas />,
  },
  {
    number: "03",
    title: "Instant Compile",
    description: "The background Tectonic engine compiles your project on-the-fly. The visual editor updates in real time with page-accurate previews of math, layout, and images as you type.",
    canvas: <Step3TectonicCompileCanvas />,
  },
  {
    number: "04",
    title: "Export & Share",
    description: "Download your final typeset, publication-ready PDF document, or invite your co-authors and research collaborators to join your shared isolated sandboxes.",
    canvas: <Step4ExportShareCanvas />,
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
    if (latest < 0.25) {
      setActiveStep(0);
    } else if (latest < 0.5) {
      setActiveStep(1);
    } else if (latest < 0.75) {
      setActiveStep(2);
    } else {
      setActiveStep(3);
    }
  });

  return (
    <section id="how-it-works" className="w-full border-t border-border/40 relative z-10">
      {/* Scroll track container */}
      <div ref={containerRef} className="relative h-[320vh] bg-background">
        {/* Sticky viewport frame */}
        <div className="sticky top-0 h-screen flex flex-col justify-center max-w-7xl mx-auto px-6 py-12 overflow-hidden">
          {/* Header */}
          <div className="text-center mb-8 shrink-0">
            <h2 className="text-3xl sm:text-4xl font-medium font-serif tracking-tight text-foreground">
              How It Works
            </h2>
            <p className="mt-2 text-sm sm:text-base text-foreground/70 font-light max-w-xl mx-auto">
              From prompt or scratch draft to a publication-ready PDF in minutes.
            </p>
          </div>

          {/* Main Split Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center flex-1 max-h-[600px]">
            {/* Left Column: Steps List */}
            <div className="lg:col-span-5 flex flex-col gap-6 justify-center">
              {steps.map((step, idx) => {
                const isActive = activeStep === idx;
                return (
                  <div
                    key={step.number}
                    className={`transition-all duration-300 p-4 rounded-xl border ${
                      isActive
                        ? "bg-foreground/5 border-primary/30 shadow-md scale-[1.02]"
                        : "bg-transparent border-transparent opacity-40 hover:opacity-70"
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
                  </div>
                );
              })}
            </div>

            {/* Right Column: Dynamic Stage Canvas */}
            <div className="lg:col-span-7 flex items-center justify-center min-h-[300px]">
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
