"use client";

import React from "react";
import { Star } from "lucide-react";
import { MarqueeEffect } from "@/components/marquee-effect";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";

export interface TestimonialCardProps {
  name: string;
  role: string;
  img?: string;
  description: string;
}

const testimonials = [
  {
    name: "Priya Nandakumar",
    role: "PhD Candidate, Applied Mathematics",
    img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    description:
      "SomeScript cut my thesis formatting time in half. The AI drafts my equation environments almost exactly how I'd write them by hand."
  },
  {
    name: "Marcus Elle",
    role: "Postdoctoral Researcher, Physics",
    img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    description:
      "Compilation used to be the most annoying part of my workflow. Now it's instant, and the PDF preview updates as I type."
  },
  {
    name: "Sofia Bianchi",
    role: "Research Scientist",
    img: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150",
    description:
      "Workspace isolation means my collaborators and I never step on each other's drafts. It finally feels like a real writing tool for research."
  },
  {
    name: "Dr. Aris Thorne",
    role: "Professor of Computer Science",
    img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150",
    description:
      "The auto-complete for citations and BibTeX generation is flawless. It saves our lab hours of manual cross-referencing."
  },
  {
    name: "Elena Rostova",
    role: "Bioinformatics Researcher",
    img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    description:
      "I love the embedded AI chat. I can ask it to generate complex tables and TikZ diagrams, and they compile on the first try."
  },
  {
    name: "David Vance",
    role: "Astrophysics PhD",
    img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150",
    description:
      "Managing large-scale collaborative papers used to be a nightmare of merge conflicts. SomeScript solves this beautifully."
  },
  {
    name: "Dr. Kenji Sato",
    role: "Quantum Computing Researcher",
    img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150",
    description:
      "The real-time rendering is incredibly fast. I don't have to wait for local Tectonic or MacTeX installations anymore."
  },
  {
    name: "Sarah Jenkins",
    role: "Graduate Student, Economics",
    img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
    description:
      "The clean, minimal UI keeps me focused on the writing. It's the best LaTeX editor I've ever used."
  },
  {
    name: "Liam O'Connor",
    role: "Statistics Lecturer",
    img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150",
    description:
      "Drafting lecture notes and exams with embedded math is incredibly smooth. The AI understands mathematical context perfectly."
  }
];

export function TestimonialCard({ item }: { item: TestimonialCardProps }) {
  return (
    <LiquidGlassCard
      glassSize="sm"
      className="mb-4 flex w-full flex-col justify-between gap-4 border border-border/60 bg-background/95 shadow-sm rounded-xl hover:-translate-y-0.5 transition-all duration-300"
    >
      <div className="space-y-3">
        <div className="flex gap-0.5 text-amber-500">
          <Star className="size-4 fill-current" />
          <Star className="size-4 fill-current" />
          <Star className="size-4 fill-current" />
          <Star className="size-4 fill-current" />
          <Star className="size-4 fill-current" />
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed font-light">
          &ldquo;{item.description}&rdquo;
        </p>
      </div>

      <div className="flex w-full items-center gap-3 mt-2">
        <Avatar className="h-9 w-9 border border-border">
          <AvatarImage src={item.img} alt={item.name} />
        </Avatar>
        <div>
          <p className="text-sm font-medium text-foreground">{item.name}</p>
          <p className="text-xs text-foreground/60 font-light">{item.role}</p>
        </div>
      </div>
    </LiquidGlassCard>
  );
}

export function Testimonials() {
  return (
    <section id="testimonials" className="w-full max-w-7xl mx-auto px-6 py-20 relative z-10 border-t border-border/40">
      <div className="text-center mb-12">
        <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 px-3 py-1 text-xs">
          Testimonials
        </Badge>
        <h2 className="text-3xl sm:text-4xl font-medium font-serif tracking-tight text-foreground mt-4">
          Loved by Researchers
        </h2>
        <p className="mt-3 text-sm sm:text-base text-foreground/70 font-light max-w-xl mx-auto">
          See what scholars and scientists are saying about their typesetting experience.
        </p>
      </div>

      {/* Grid container with fading mask applied at the top and bottom of the container */}
      <div
        className="relative grid h-[550px] grid-cols-1 gap-4 overflow-hidden md:grid-cols-2 lg:h-[650px] lg:grid-cols-3 p-1.5"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 10%, rgba(0,0,0,0.6) 30%, black 48%, black 52%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.1) 90%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 10%, rgba(0,0,0,0.6) 30%, black 48%, black 52%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.1) 90%, transparent 100%)"
        }}
      >
        {[
          { reverse: false, visibility: "block" },
          { reverse: true, visibility: "hidden md:block" },
          { reverse: false, visibility: "hidden lg:block" }
        ].map((mq, i) => (
          <div key={i} className={`relative h-full animate-fade-in p-1 ${mq.visibility}`}>
            <MarqueeEffect
              gap={16}
              direction="vertical"
              reverse={mq.reverse}
              speed={20}
              speedOnHover={2}
              className="h-full p-1"
            >
              {testimonials.slice(i * 3, (i + 1) * 3).map((testimonial, index) => (
                <TestimonialCard key={index} item={testimonial} />
              ))}
            </MarqueeEffect>
          </div>
        ))}
      </div>
    </section>
  );
}
