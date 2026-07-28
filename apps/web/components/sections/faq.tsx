"use client";

import React from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";

const faqs = [
  {
    question: "What is Tectonic compilation?",
    answer:
      "Tectonic is a modern LaTeX engine. We run it on high-speed servers so your document compiles in seconds without you needing to install anything locally.",
  },
  {
    question: "Can the AI write my whole paper for me?",
    answer:
      "The AI assistant can draft outlines, equations, tables, and citations from a prompt, but it's designed to accelerate your writing, not replace your judgment as the author.",
  },
  {
    question: "Is there a free tier?",
    answer:
      "Yes. You can start typesetting for free from the dashboard. Paid plans unlock additional compilation speed and collaboration features.",
  },
  {
    question: "How do workspaces work?",
    answer:
      "Workspaces (powered by Clerk) let you organize documents by project or team, with shared access and full document history for collaborators.",
  },
  {
    question: "Can I import an existing LaTeX project?",
    answer:
      "Yes, you can bring your existing .tex and .bib files into a workspace and continue editing with the same AI and compilation tools.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20 relative z-10 border-t border-border/40">
      <div className="text-center mb-8 sm:mb-12">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium font-serif tracking-tight text-foreground">
          Frequently Asked Questions
        </h2>
      </div>

      <LiquidGlassCard
        glassSize="default"
        className="border-border bg-background rounded-xl p-4 sm:p-6"
      >
        <Accordion type="single" collapsible className="w-full">
          {faqs.map(({ question, answer }) => (
            <AccordionItem key={question} value={question} className="border-border last:border-0">
              <AccordionTrigger className="font-serif text-sm sm:text-base text-foreground hover:text-foreground/80 hover:no-underline transition-colors py-3.5 sm:py-4 text-left">
                {question}
              </AccordionTrigger>
              <AccordionContent className="text-xs sm:text-sm text-foreground/70 font-light leading-relaxed pb-4">
                {answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </LiquidGlassCard>
    </section>
  );
}
