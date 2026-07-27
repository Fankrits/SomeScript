"use client";

import { useRef, useEffect, useCallback, useState, type ReactNode, type CSSProperties } from "react";
import { gsap } from "gsap";
import { CheckCircle2, Sparkles, Copy, ThumbsUp, ArrowUp, Bot, Building2, ChevronDown } from "lucide-react";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";
import { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge } from "@/components/ui/avatar";
import "./magic-bento.css";

const DEFAULT_PARTICLE_COUNT = 12;
const DEFAULT_SPOTLIGHT_RADIUS = 300;
const DEFAULT_GLOW_COLOR = "150, 220, 248"; // hero code-editor accent cyan (#96dcf8)
const MOBILE_BREAKPOINT = 768;

interface BentoCard {
  title: string;
  description: string;
  label: string;
}

const cardData: BentoCard[] = [
  {
    label: "AI Agent",
    title: "AI Generation",
    description: "Draft outlines, equations, and citations from a single prompt.",
  },
  {
    label: "Workspace",
    title: "Team Workspaces",
    description: "Collaborate seamlessly across research teams with multi-user workspace permissions.",
  },
  {
    label: "Debug",
    title: "Terminal & Error Repair",
    description:
      "Run terminal commands, inspect build logs, and instantly send compilation errors to the AI Agent for automatic repair.",
  },
  {
    label: "Collaboration",
    title: "Real-Time Co-Authoring",
    description:
      "Edit LaTeX documents simultaneously with co-authors and AI agents with live presence and multi-cursor sync.",
  },
  {
    label: "Task Management",
    title: "Kanban Tasks",
    description: "Organize your workflow with drag-and-drop kanban boards to track progress and sync with collaborators.",
  },
];

const createParticleElement = (x: number, y: number, color: string = DEFAULT_GLOW_COLOR) => {
  const el = document.createElement("div");
  el.className = "particle";
  el.style.cssText = `
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(${color}, 1);
    box-shadow: 0 0 6px rgba(${color}, 0.6);
    pointer-events: none;
    z-index: 100;
    left: ${x}px;
    top: ${y}px;
  `;
  return el;
};

const calculateSpotlightValues = (radius: number) => ({
  proximity: radius * 0.5,
  fadeDistance: radius * 0.75,
});

const updateCardGlowProperties = (card: HTMLElement, mouseX: number, mouseY: number, glow: number, radius: number) => {
  const rect = card.getBoundingClientRect();
  const relativeX = ((mouseX - rect.left) / rect.width) * 100;
  const relativeY = ((mouseY - rect.top) / rect.height) * 100;

  card.style.setProperty("--glow-x", `${relativeX}%`);
  card.style.setProperty("--glow-y", `${relativeY}%`);
  card.style.setProperty("--glow-intensity", glow.toString());
  card.style.setProperty("--glow-radius", `${radius}px`);
};

interface ParticleCardProps {
  children: ReactNode;
  className?: string;
  disableAnimations?: boolean;
  style?: CSSProperties;
  particleCount?: number;
  glowColor?: string;
  enableTilt?: boolean;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}

const ParticleCard = ({
  children,
  className = "",
  disableAnimations = false,
  style,
  particleCount = DEFAULT_PARTICLE_COUNT,
  glowColor = DEFAULT_GLOW_COLOR,
  enableTilt = true,
  clickEffect = false,
  enableMagnetism = false,
}: ParticleCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isHoveredRef = useRef(false);
  const memoizedParticles = useRef<HTMLDivElement[]>([]);
  const particlesInitialized = useRef(false);
  const magnetismAnimationRef = useRef<gsap.core.Tween | null>(null);

  const initializeParticles = useCallback(() => {
    if (particlesInitialized.current || !cardRef.current) return;

    const { width, height } = cardRef.current.getBoundingClientRect();
    memoizedParticles.current = Array.from({ length: particleCount }, () =>
      createParticleElement(Math.random() * width, Math.random() * height, glowColor)
    );
    particlesInitialized.current = true;
  }, [particleCount, glowColor]);

  const clearAllParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    magnetismAnimationRef.current?.kill();

    particlesRef.current.forEach((particle) => {
      gsap.to(particle, {
        scale: 0,
        opacity: 0,
        duration: 0.3,
        ease: "back.in(1.7)",
        onComplete: () => {
          particle.parentNode?.removeChild(particle);
        },
      });
    });
    particlesRef.current = [];
  }, []);

  const animateParticles = useCallback(() => {
    if (!cardRef.current || !isHoveredRef.current) return;

    if (!particlesInitialized.current) {
      initializeParticles();
    }

    memoizedParticles.current.forEach((particle, index) => {
      const timeoutId = setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return;

        const clone = particle.cloneNode(true) as HTMLDivElement;
        cardRef.current.appendChild(clone);
        particlesRef.current.push(clone);

        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.7)" });

        gsap.to(clone, {
          x: (Math.random() - 0.5) * 100,
          y: (Math.random() - 0.5) * 100,
          rotation: Math.random() * 360,
          duration: 2 + Math.random() * 2,
          ease: "none",
          repeat: -1,
          yoyo: true,
        });

        gsap.to(clone, {
          opacity: 0.3,
          duration: 1.5,
          ease: "power2.inOut",
          repeat: -1,
          yoyo: true,
        });
      }, index * 100);

      timeoutsRef.current.push(timeoutId);
    });
  }, [initializeParticles]);

  useEffect(() => {
    if (disableAnimations || !cardRef.current) return;

    const element = cardRef.current;

    const handleMouseEnter = () => {
      isHoveredRef.current = true;
      animateParticles();

      if (enableTilt) {
        gsap.to(element, {
          rotateX: 5,
          rotateY: 5,
          duration: 0.3,
          ease: "power2.out",
          transformPerspective: 1000,
        });
      }
    };

    const handleMouseLeave = () => {
      isHoveredRef.current = false;
      clearAllParticles();

      if (enableTilt) {
        gsap.to(element, {
          rotateX: 0,
          rotateY: 0,
          duration: 0.3,
          ease: "power2.out",
        });
      }

      if (enableMagnetism) {
        gsap.to(element, {
          x: 0,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!enableTilt && !enableMagnetism) return;

      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      if (enableTilt) {
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;

        gsap.to(element, {
          rotateX,
          rotateY,
          duration: 0.1,
          ease: "power2.out",
          transformPerspective: 1000,
        });
      }

      if (enableMagnetism) {
        const magnetX = (x - centerX) * 0.05;
        const magnetY = (y - centerY) * 0.05;

        magnetismAnimationRef.current = gsap.to(element, {
          x: magnetX,
          y: magnetY,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (!clickEffect) return;

      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const maxDistance = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height)
      );

      const ripple = document.createElement("div");
      ripple.style.cssText = `
        position: absolute;
        width: ${maxDistance * 2}px;
        height: ${maxDistance * 2}px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(${glowColor}, 0.4) 0%, rgba(${glowColor}, 0.2) 30%, transparent 70%);
        left: ${x - maxDistance}px;
        top: ${y - maxDistance}px;
        pointer-events: none;
        z-index: 1000;
      `;

      element.appendChild(ripple);

      gsap.fromTo(
        ripple,
        { scale: 0, opacity: 1 },
        {
          scale: 1,
          opacity: 0,
          duration: 0.8,
          ease: "power2.out",
          onComplete: () => ripple.remove(),
        }
      );
    };

    element.addEventListener("mouseenter", handleMouseEnter);
    element.addEventListener("mouseleave", handleMouseLeave);
    element.addEventListener("mousemove", handleMouseMove);
    element.addEventListener("click", handleClick);

    return () => {
      isHoveredRef.current = false;
      element.removeEventListener("mouseenter", handleMouseEnter);
      element.removeEventListener("mouseleave", handleMouseLeave);
      element.removeEventListener("mousemove", handleMouseMove);
      element.removeEventListener("click", handleClick);
      clearAllParticles();
    };
  }, [animateParticles, clearAllParticles, disableAnimations, enableTilt, enableMagnetism, clickEffect, glowColor]);

  return (
    <div ref={cardRef} className={`${className} particle-container`} style={{ ...style, position: "relative", overflow: "hidden" }}>
      {children}
    </div>
  );
};

interface GlobalSpotlightProps {
  gridRef: React.RefObject<HTMLDivElement | null>;
  disableAnimations?: boolean;
  enabled?: boolean;
  spotlightRadius?: number;
  glowColor?: string;
}

const GlobalSpotlight = ({
  gridRef,
  disableAnimations = false,
  enabled = true,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  glowColor = DEFAULT_GLOW_COLOR,
}: GlobalSpotlightProps) => {
  const spotlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disableAnimations || !gridRef?.current || !enabled) return;

    const spotlight = document.createElement("div");
    spotlight.className = "global-spotlight";
    spotlight.style.cssText = `
      position: fixed;
      width: 800px;
      height: 800px;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle,
        rgba(${glowColor}, 0.15) 0%,
        rgba(${glowColor}, 0.08) 15%,
        rgba(${glowColor}, 0.04) 25%,
        rgba(${glowColor}, 0.02) 40%,
        rgba(${glowColor}, 0.01) 65%,
        transparent 70%
      );
      z-index: 200;
      opacity: 0;
      transform: translate(-50%, -50%);
      mix-blend-mode: screen;
    `;
    document.body.appendChild(spotlight);
    spotlightRef.current = spotlight;

    const handleMouseMove = (e: MouseEvent) => {
      if (!spotlightRef.current || !gridRef.current) return;

      const section = gridRef.current.closest(".bento-section");
      const rect = section?.getBoundingClientRect();
      const mouseInside = rect ? e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom : false;

      const cards = gridRef.current.querySelectorAll<HTMLElement>(".magic-bento-card");

      if (!mouseInside) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3, ease: "power2.out" });
        cards.forEach((card) => card.style.setProperty("--glow-intensity", "0"));
        return;
      }

      const { proximity, fadeDistance } = calculateSpotlightValues(spotlightRadius);
      let minDistance = Infinity;

      cards.forEach((card) => {
        const cardRect = card.getBoundingClientRect();
        const centerX = cardRect.left + cardRect.width / 2;
        const centerY = cardRect.top + cardRect.height / 2;
        const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY) - Math.max(cardRect.width, cardRect.height) / 2;
        const effectiveDistance = Math.max(0, distance);

        minDistance = Math.min(minDistance, effectiveDistance);

        let glowIntensity = 0;
        if (effectiveDistance <= proximity) {
          glowIntensity = 1;
        } else if (effectiveDistance <= fadeDistance) {
          glowIntensity = (fadeDistance - effectiveDistance) / (fadeDistance - proximity);
        }

        updateCardGlowProperties(card, e.clientX, e.clientY, glowIntensity, spotlightRadius);
      });

      gsap.to(spotlightRef.current, { left: e.clientX, top: e.clientY, duration: 0.1, ease: "power2.out" });

      const targetOpacity =
        minDistance <= proximity
          ? 0.8
          : minDistance <= fadeDistance
            ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8
            : 0;

      gsap.to(spotlightRef.current, {
        opacity: targetOpacity,
        duration: targetOpacity > 0 ? 0.2 : 0.5,
        ease: "power2.out",
      });
    };

    const handleMouseLeave = () => {
      gridRef.current?.querySelectorAll<HTMLElement>(".magic-bento-card").forEach((card) => {
        card.style.setProperty("--glow-intensity", "0");
      });
      if (spotlightRef.current) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3, ease: "power2.out" });
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      spotlightRef.current?.parentNode?.removeChild(spotlightRef.current);
    };
  }, [gridRef, disableAnimations, enabled, spotlightRadius, glowColor]);

  return null;
};

const BentoCardGrid = ({ children, gridRef }: { children: ReactNode; gridRef: React.RefObject<HTMLDivElement | null> }) => (
  <div className="card-grid bento-section" ref={gridRef}>
    {children}
  </div>
);

const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
};

/* ---- Animated per-card visuals ---- */

const SineGraph = () => (
  <svg viewBox="0 0 240 110" fill="none" preserveAspectRatio="xMidYMid meet">
    <line x1="20" y1="12" x2="20" y2="96" stroke="currentColor" strokeOpacity="0.15" />
    <line x1="20" y1="55" x2="232" y2="55" stroke="currentColor" strokeOpacity="0.15" />
    {[70, 120, 170, 220].map((x) => (
      <line key={x} x1={x} y1="12" x2={x} y2="96" stroke="currentColor" strokeOpacity="0.06" />
    ))}
    <path
      id="bento-sine"
      d="M20,55 C36.7,25 53.3,25 70,55 C86.7,85 103.3,85 120,55 C136.7,25 153.3,25 170,55 C186.7,85 203.3,85 220,55"
      stroke="#0f4c5c"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="320"
      strokeDashoffset="320"
      className="bento-draw"
    />
    <circle r="3.5" fill="#dd7e21">
      <animateMotion dur="3s" repeatCount="indefinite">
        <mpath href="#bento-sine" />
      </animateMotion>
    </circle>
  </svg>
);

const CitationTrails = () => (
  <svg viewBox="0 0 300 156" fill="none" preserveAspectRatio="xMidYMid meet" aria-label="Animated citations connecting a manuscript to its bibliography">
    <rect x="14" y="20" width="98" height="116" rx="6" fill="#0f4c5c" fillOpacity="0.035" stroke="#0f4c5c" strokeOpacity="0.22" />
    <text x="27" y="39" fill="#0f4c5c" fillOpacity="0.6" fontSize="7" fontFamily="monospace">draft.tex</text>
    {[
      { y: 54, width: 58 },
      { y: 67, width: 70 },
      { y: 80, width: 47 },
      { y: 93, width: 65 },
      { y: 106, width: 40 },
    ].map((line, i) => (
      <line key={line.y} x1="27" y1={line.y} x2={27 + line.width} y2={line.y} stroke="#0f4c5c" strokeWidth="2" strokeOpacity={i === 1 || i === 3 ? "0.42" : "0.14"} />
    ))}

    {[{ y: 67, label: "[1]", targetY: 39, delay: "0s" }, { y: 93, label: "[2]", targetY: 78, delay: "0.45s" }].map((citation) => (
      <g key={citation.label}>
        <circle cx="100" cy={citation.y} r="5" fill="#1f7ea6" className="bento-pop" style={{ animationDelay: citation.delay }} />
        <text x="96.3" y={citation.y + 2.3} fill="white" fontSize="5" fontWeight="700">{citation.label.slice(1, -1)}</text>
        <path
          d={`M105 ${citation.y} C145 ${citation.y}, 147 ${citation.targetY}, 180 ${citation.targetY}`}
          stroke="#1f7ea6"
          strokeOpacity="0.6"
          strokeWidth="1.5"
          strokeDasharray="110"
          strokeDashoffset="110"
          className="bento-draw"
          style={{ animationDelay: citation.delay }}
        />
      </g>
    ))}

    <text x="180" y="21" fill="#0f4c5c" fillOpacity="0.58" fontSize="7" fontFamily="monospace">sources.bib</text>
    {[{ y: 30, h: 21, key: "knuth84", delay: "0.25s" }, { y: 69, h: 21, key: "lamport94", delay: "0.7s" }, { y: 108, h: 18, key: "mittelbach04", delay: "1.05s" }].map((reference) => (
      <g key={reference.key}>
        <rect x="180" y={reference.y} width="105" height={reference.h} rx="4" fill="#fff" fillOpacity="0.42" stroke="#0f4c5c" strokeOpacity="0.16" />
        <line x1="190" y1={reference.y + 8} x2="250" y2={reference.y + 8} stroke="#0f4c5c" strokeWidth="1.8" strokeOpacity="0.43" />
        <line x1="190" y1={reference.y + 14} x2="231" y2={reference.y + 14} stroke="#0f4c5c" strokeWidth="1.5" strokeOpacity="0.16" />
        <circle cx="274" cy={reference.y + reference.h / 2} r="3" fill="#1f9563" className="bento-pop" style={{ animationDelay: reference.delay }} />
      </g>
    ))}
    <path d="M112 122 C141 136 154 136 180 117" stroke="#dd7e21" strokeWidth="1.5" strokeOpacity="0.64" strokeDasharray="90" strokeDashoffset="90" className="bento-draw" style={{ animationDelay: "1.15s" }} />
    <circle cx="147" cy="134" r="3.5" fill="#dd7e21">
      <animateMotion dur="3s" repeatCount="indefinite" begin="1.15s" path="M0 0 C10 3 22 3 34 -17" />
    </circle>
  </svg>
);

const CommitGraph = () => (
  <svg viewBox="0 0 130 110" fill="none" preserveAspectRatio="xMidYMid meet">
    <path d="M30,16 L30,96" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" strokeDasharray="90" strokeDashoffset="90" className="bento-draw" />
    <path
      d="M30,42 C30,58 74,50 74,66"
      stroke="#dd7e21"
      strokeOpacity="0.55"
      strokeWidth="2"
      strokeDasharray="70"
      strokeDashoffset="70"
      className="bento-draw"
      style={{ animationDelay: "0.5s" }}
    />
    {[
      { cx: 30, cy: 20, d: "0s" },
      { cx: 30, cy: 42, d: "0.3s" },
      { cx: 30, cy: 68, d: "0.7s" },
      { cx: 30, cy: 94, d: "1s" },
    ].map((p, i) => (
      <circle key={i} cx={p.cx} cy={p.cy} r="5.5" fill="#0f4c5c" className="bento-pop" style={{ animationDelay: p.d }} />
    ))}
    <circle cx="74" cy="66" r="5" fill="#dd7e21" className="bento-pop" style={{ animationDelay: "0.85s" }} />
  </svg>
);

const VisualAiChat = () => (
  <div className="w-full rounded-xl border border-border/70 bg-background/95 p-2.5 shadow-sm backdrop-blur-md text-left flex flex-col justify-between select-none">
    {/* Header */}
    <div className="flex items-center justify-between border-b border-border/40 pb-1.5 mb-2">
      <div className="flex items-center gap-1.5 font-medium text-[11px] text-foreground">
        <span>AI Agent</span>
      </div>
      <div className="flex items-center gap-1 text-[9.5px] font-mono text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-[#1f9563] animate-pulse" />
        <span>Ready</span>
      </div>
    </div>

    {/* Message stream */}
    <div className="space-y-2 my-0.5">
      {/* User Bubble */}
      <div className="flex justify-end">
        <div className="rounded-xl rounded-tr-xs bg-[#1c2e36] px-2.5 py-1 text-[10.5px] font-medium text-white shadow-xs">
          Format Schrödinger equation
        </div>
      </div>

      {/* Assistant Bubble */}
      <div className="flex-1 space-y-1">
        <div className="rounded-xl bg-muted/40 p-2 border border-border/30 font-mono text-[10px]">
          <div className="text-[#1f7ea6] font-semibold">
            {"i\\hbar \\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi"}
          </div>
        </div>
      </div>
    </div>

    {/* Input Box */}
    <div className="mt-2 flex items-center justify-between rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1 truncate">
        Ask AI Agent to write or fix LaTeX...
        <span className="h-3 w-[1.5px] bg-[#1f7ea6] bento-blink" />
      </span>
      <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#1c2e36] text-white shrink-0 ml-1">
        <ArrowUp className="h-2.5 w-2.5" />
      </div>
    </div>
  </div>
);

const RealtimeCollaborateCard = () => (
  <div className="relative w-full h-[210px] rounded-xl bg-gradient-to-b from-muted/30 to-muted/10 border border-border/40 p-2.5 overflow-hidden select-none">
    {/* Subtle background grid */}
    <div className="absolute inset-0 bg-[radial-gradient(#1c2e36_1px,transparent_1px)] [background-size:12px_12px] opacity-[0.07]" />

    {/* Single Editor Window Panel */}
    <div className="relative z-10 w-full h-full rounded-xl bg-background/95 border border-border/70 shadow-md p-3 flex flex-col justify-between overflow-hidden">
      {/* Window Top Bar */}
      <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400/70" />
          <span className="h-2 w-2 rounded-full bg-yellow-400/70" />
          <span className="h-2 w-2 rounded-full bg-green-400/70" />
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">main.tex</span>
        </div>
        <div className="flex items-center gap-1 text-[9.5px] text-muted-foreground font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1f9563] animate-pulse" />
          <span>3 co-authors editing</span>
        </div>
      </div>

      {/* Code Editor Content */}
      <div className="font-mono text-[10.5px] leading-relaxed space-y-1.5 flex-1 pt-0.5 text-foreground/80">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/40 w-4 text-right text-[9px] font-sans select-none">1</span>
          <span className="text-muted-foreground">\documentclass{"{article}"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/40 w-4 text-right text-[9px] font-sans select-none">2</span>
          <span className="text-muted-foreground">\begin{"{document}"}</span>
        </div>
        <div className="flex items-center gap-2 bg-[#0284c7]/10 px-1.5 py-0.5 rounded border-l-2 border-[#0284c7] bento-shimmer">
          <span className="text-muted-foreground/40 w-4 text-right text-[9px] font-sans select-none">3</span>
          <span>\section{"{Quantum Entanglement}"}</span>
        </div>
        <div className="flex items-center gap-2 bg-[#c026d3]/10 px-1.5 py-0.5 rounded border-l-2 border-[#c026d3]">
          <span className="text-muted-foreground/40 w-4 text-right text-[9px] font-sans select-none">4</span>
          <span>\equation{"{\\Psi(x,t) = A e^{i(kx-\\omega t)}}"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/40 w-4 text-right text-[9px] font-sans select-none">5</span>
          <span className="text-muted-foreground">\end{"{document}"}</span>
        </div>
      </div>
    </div>

    {/* Floating Animated Collaborative Cursors */}
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* Cursor 1: John */}
      <div className="absolute top-0 left-0 bento-collab-cursor-1">
        <div className="flex items-start gap-1">
          <svg className="w-3.5 h-3.5 text-[#0284c7] drop-shadow-xs" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.5 3.21z" />
          </svg>
          <div className="flex items-center gap-1.5 rounded-full bg-[#0284c7] px-2 py-0.5 text-[9px] font-semibold text-white shadow-md">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/20 text-[7.5px] font-bold">J</span>
            <span>John</span>
          </div>
        </div>
      </div>

      {/* Cursor 2: You */}
      <div className="absolute top-0 left-0 bento-collab-cursor-2">
        <div className="flex items-start gap-1">
          <svg className="w-3.5 h-3.5 text-[#18181b] drop-shadow-xs" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.5 3.21z" />
          </svg>
          <div className="flex items-center gap-1.5 rounded-full bg-[#18181b] px-2 py-0.5 text-[9px] font-semibold text-white shadow-md">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/20 text-[7.5px] font-bold">JC</span>
            <span>You</span>
          </div>
        </div>
      </div>

      {/* Cursor 3: Sara */}
      <div className="absolute top-0 left-0 bento-collab-cursor-3">
        <div className="flex items-start gap-1">
          <svg className="w-3.5 h-3.5 text-[#c026d3] drop-shadow-xs" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.5 3.21z" />
          </svg>
          <div className="flex items-center gap-1.5 rounded-full bg-[#c026d3] px-2 py-0.5 text-[9px] font-semibold text-white shadow-md">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/20 text-[7.5px] font-bold">S</span>
            <span>Sara</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const WorkspaceCardVisual = () => (
  <div className="relative w-full h-[200px] sm:h-[210px] rounded-xl bg-gradient-to-b from-muted/30 to-muted/10 border border-border/40 p-3.5 flex flex-col justify-between overflow-hidden select-none">
    {/* Subtle background grid pattern */}
    <div className="absolute inset-0 bg-[radial-gradient(#1c2e36_1px,transparent_1px)] [background-size:12px_12px] opacity-[0.06]" />

    {/* Header info */}
    <div className="relative z-10 flex items-center justify-between w-full font-mono text-[9.5px] text-muted-foreground">
      <span>Organization</span>
      <span className="text-[#1f9563] font-semibold flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[#1f9563] animate-pulse" />
        Active Workspace
      </span>
    </div>

    {/* Center Organization Card (matching user screenshot) */}
    <div className="relative z-10 my-auto flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border/80 shadow-md shadow-black/5 hover:border-[#0f4c5c]/40 transition-all cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f4c5c] to-[#135d70] text-white shadow-xs">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          <div className="flex flex-col text-left">
            <span className="font-semibold text-[13.5px] text-foreground tracking-tight leading-tight">My Organize</span>
            <span className="text-[9.5px] text-muted-foreground font-medium">Enterprise Team</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="flex h-2 w-2 rounded-full bg-[#1f9563]" />
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
    </div>

    {/* Team Avatars Footer */}
    <div className="relative z-10 flex items-center justify-between pt-2 border-t border-border/30">
      <span className="text-[10px] font-medium text-muted-foreground font-mono">Team Members</span>
      <AvatarGroup className="-space-x-2">
        <Avatar size="sm" className="border-2 border-background shadow-xs">
          <AvatarImage src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" alt="Sarah" />
          <AvatarFallback className="bg-[#0284c7] text-white text-[10px] font-bold">SK</AvatarFallback>
          <AvatarBadge className="bg-[#1f9563]" />
        </Avatar>
        <Avatar size="sm" className="border-2 border-background shadow-xs">
          <AvatarImage src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80" alt="John" />
          <AvatarFallback className="bg-[#c026d3] text-white text-[10px] font-bold">JD</AvatarFallback>
          <AvatarBadge className="bg-[#1f9563]" />
        </Avatar>
        <Avatar size="sm" className="border-2 border-background shadow-xs">
          <AvatarImage src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80" alt="Alex" />
          <AvatarFallback className="bg-[#18181b] text-white text-[10px] font-bold">AL</AvatarFallback>
          <AvatarBadge className="bg-[#1f9563]" />
        </Avatar>
        <Avatar size="sm" className="border-2 border-background shadow-xs">
          <AvatarImage src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80" alt="Michael" />
          <AvatarFallback className="bg-[#dd7e21] text-white text-[10px] font-bold">MK</AvatarFallback>
        </Avatar>
        <AvatarGroupCount className="text-[10px] font-semibold bg-muted text-muted-foreground border-2 border-background">
          +3
        </AvatarGroupCount>
      </AvatarGroup>
    </div>
  </div>
);

const DebugTerminalCardVisual = () => {
  const [status, setStatus] = useState<"error" | "fixing" | "success">("error");

  useEffect(() => {
    const timer = setInterval(() => {
      setStatus((prev) => {
        if (prev === "error") return "fixing";
        if (prev === "fixing") return "success";
        return "error";
      });
    }, 3200);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-[200px] sm:h-[210px] rounded-xl bg-[#09090b] border border-border/70 p-3.5 flex flex-col justify-between overflow-hidden shadow-lg select-none font-mono text-[10.5px] leading-relaxed text-white">
      {/* Top Bar with window controls & Send to chat button */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400/80" />
          <span className="h-2 w-2 rounded-full bg-yellow-400/80" />
          <span className="h-2 w-2 rounded-full bg-green-400/80" />
        </div>
        <button
          className={`rounded-md border px-2.5 py-1 text-[10px] transition-all font-sans cursor-pointer ${
            status === "error"
              ? "border-sky-400/80 bg-sky-500/25 text-sky-200 shadow-sm animate-pulse"
              : status === "fixing"
              ? "border-amber-400/80 bg-amber-500/20 text-amber-200"
              : "border-emerald-400/80 bg-emerald-500/20 text-emerald-200"
          }`}
        >
          {status === "error" && "Send to chat"}
          {status === "fixing" && "Fixing with AI..."}
          {status === "success" && "Fixed by AI"}
        </button>
      </div>

      {/* Terminal Log Output - Regenerating from top */}
      <div key={status} className="space-y-1 text-white/90 flex-1 pt-0.5 animate-fadeIn">
        {status === "error" && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>Initializing Tectonic LaTeX environment...</span>
            </div>
            <div>
              <span className="text-[#38bdf8]">Loading core engines: </span>
              <span className="text-white/80">XeTeX, BibTeX, xdvipdfmx</span>
            </div>
            <div>
              <span className="text-[#38bdf8]">Connecting packages cache: </span>
              <span className="text-white/80">tectonic-cache-repo</span>
            </div>
            <div className="pt-1 flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>LaTeX system ready in <span className="text-[#a3e635] font-medium">0.8s</span></span>
            </div>
            <div className="pt-1.5 text-amber-400">
              <div>System Status: <span className="font-semibold">SYNTAX ERROR</span></div>
              <div className="text-amber-300/90 text-[10px] pt-0.5">✖ main.tex:42: Unclosed bracket in \equation. Click &apos;Send to chat&apos; for AI repair.</div>
            </div>
          </>
        )}

        {status === "fixing" && (
          <>
            <div className="flex items-center gap-1.5 text-sky-300 animate-pulse font-semibold">
              <span>✦ Sending error log to AI Agent...</span>
            </div>
            <div className="text-white/80 pt-0.5">
              <span className="text-[#38bdf8]">AI Repair Engine: </span>
              <span>fixing unclosed bracket in main.tex:42</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400 pt-1">
              <span className="font-bold">✓</span>
              <span>Updated \equation syntax &amp; saved main.tex</span>
            </div>
            <div className="pt-1 text-white/50 text-[10px]">Re-triggering Tectonic build process...</div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>Initializing Tectonic LaTeX environment...</span>
            </div>
            <div>
              <span className="text-[#38bdf8]">Loading core engines: </span>
              <span className="text-white/80">XeTeX, BibTeX, xdvipdfmx</span>
            </div>
            <div>
              <span className="text-[#38bdf8]">Connecting packages cache: </span>
              <span className="text-white/80">tectonic-cache-repo</span>
            </div>
            <div className="pt-1 flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>LaTeX compilation successful in <span className="text-[#a3e635] font-semibold">0.4s</span></span>
            </div>
            <div className="pt-1 text-emerald-400 font-semibold">
              <div>System Status: <span className="text-emerald-300 font-bold">COMPILED (0 errors)</span></div>
              <div className="text-white/70 text-[10px] font-normal pt-0.5">Generated output: main.pdf (1.2 MB)</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const KanbanCardVisual = () => (
  <div className="relative w-full h-[200px] sm:h-[210px] flex flex-col gap-2 select-none p-3 rounded-xl bg-gradient-to-b from-muted/30 to-muted/10 border border-border/40 overflow-hidden text-left font-sans">
    {/* Background Grid Pattern */}
    <div className="absolute inset-0 bg-[radial-gradient(#1c2e36_1px,transparent_1px)] [background-size:12px_12px] opacity-[0.06]" />

    {/* Vertical Kanban Header / Sections */}
    <div className="relative z-10 flex flex-col gap-1.5 h-full justify-between">
      {/* TO DO SECTION */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground/60 text-[8px]">▼</span>
            <span>TO DO</span>
          </div>
          <span className="bg-red-500/10 text-red-600 dark:text-red-400 font-bold px-1.5 py-0.2 rounded-full text-[8.5px]">
            2
          </span>
        </div>

        <div className="flex flex-col gap-1 pl-2">
          <div className="bg-background border border-border/40 border-l-4 border-l-red-500 rounded-md p-1.5 shadow-xs text-[9.5px] flex items-center justify-between">
            <span className="font-medium text-foreground/90 truncate">Write abstract</span>
            <span className="text-[8px] text-muted-foreground font-mono shrink-0 ml-1">2h</span>
          </div>

          {/* Animated Drag Card */}
          <div className="bento-kanban-card-animated bg-background border border-border/50 border-l-4 border-l-red-500 rounded-md p-1.5 shadow-sm text-[9.5px] flex items-center justify-between relative cursor-grab">
            <span className="font-medium text-foreground truncate">Format citations</span>
            <span className="text-[7.5px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0 ml-1">LaTeX</span>
          </div>
        </div>
      </div>

      {/* ON GOING SECTION */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground/60 text-[8px]">▼</span>
            <span>ON GOING</span>
          </div>
          <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold px-1.5 py-0.2 rounded-full text-[8.5px]">
            1
          </span>
        </div>

        <div className="flex flex-col gap-1 pl-2">
          {/* Animated drop target slot */}
          <div className="h-[28px] border border-dashed border-orange-500/40 rounded-md bg-orange-500/5 bento-kanban-drop-slot flex items-center px-2 text-[8px] text-orange-600/70 font-medium">
            <span>Drop task here...</span>
          </div>
        </div>
      </div>

      {/* FINISHED SECTION */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground/60 text-[8px]">▼</span>
            <span>FINISHED</span>
          </div>
          <span className="bg-green-500/10 text-green-600 dark:text-green-400 font-bold px-1.5 py-0.2 rounded-full text-[8.5px]">
            2
          </span>
        </div>

        <div className="flex flex-col gap-1 pl-2">
          <div className="bg-background border border-border/40 border-l-4 border-l-green-500 rounded-md p-1.5 shadow-xs text-[9.5px] flex items-center justify-between">
            <span className="font-medium text-foreground/90 truncate">Revise Chapter 2</span>
            <span className="text-[8px] text-muted-foreground font-mono shrink-0 ml-1">Done</span>
          </div>
          <div className="bg-background border border-border/40 border-l-4 border-l-green-500 rounded-md p-1.5 shadow-xs text-[9.5px] flex items-center justify-between opacity-70">
            <span className="font-medium text-muted-foreground line-through truncate">Setup project</span>
            <span className="text-[8px] text-muted-foreground font-mono shrink-0 ml-1">Done</span>
          </div>
        </div>
      </div>
    </div>

    {/* Animated Dragging Cursor */}
    <div className="absolute top-0 left-0 pointer-events-none z-30 bento-kanban-cursor-animated">
      <div className="flex items-start gap-1">
        <svg className="w-4 h-4 text-[#0f4c5c] drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.5 3.21z" />
        </svg>
      </div>
    </div>
  </div>
);

const CardVisual = ({ index }: { index: number }) => {
  switch (index) {
    case 0: // AI Co-Author Chat — visual AI chat card
      return <VisualAiChat />;
    case 1: // Team Workspaces — Shadcn Avatar stack
      return <WorkspaceCardVisual />;
    case 2: // Terminal & Error Repair — Debug terminal card with Send to Chat button
      return <DebugTerminalCardVisual />;
    case 3: // Real-Time Co-Authoring — live collaboration windows & multi-cursors
      return <RealtimeCollaborateCard />;
    case 4: // Kanban Tasks — kanban drag & drop feature
      return <KanbanCardVisual />;
    default:
      return null;
  }
};

export interface MagicBentoProps {
  textAutoHide?: boolean;
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  glowColor?: string;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}

export default function MagicBento({
  textAutoHide = true,
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableTilt = false,
  glowColor = DEFAULT_GLOW_COLOR,
  clickEffect = true,
  enableMagnetism = true,
}: MagicBentoProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobileDetection();
  const shouldDisableAnimations = disableAnimations || isMobile;

  return (
    <>
      {enableSpotlight && (
        <GlobalSpotlight
          gridRef={gridRef}
          disableAnimations={shouldDisableAnimations}
          enabled={enableSpotlight}
          spotlightRadius={spotlightRadius}
          glowColor={glowColor}
        />
      )}

      <BentoCardGrid gridRef={gridRef}>
        {cardData.map((card, index) => {
          const baseClassName = `magic-bento-card ${textAutoHide ? "magic-bento-card--text-autohide" : ""} ${
            enableBorderGlow ? "magic-bento-card--border-glow" : ""
          }`;
          const cardStyle = { "--glow-color": glowColor } as CSSProperties;

          const content = (
            <LiquidGlassCard
              glassSize="sm"
              className="magic-bento-card__glass h-full w-full bg-background border border-border rounded-[inherit] flex flex-col"
            >
              <div className="magic-bento-card__header">
                <div className="magic-bento-card__label">{card.label}</div>
              </div>
              <div className="magic-bento-card__content mt-2">
                <h3 className="magic-bento-card__title">{card.title}</h3>
                <p className="magic-bento-card__description">{card.description}</p>
              </div>
              <div className="magic-bento-card__visual">
                <CardVisual index={index} />
              </div>
            </LiquidGlassCard>
          );

          if (!enableStars) {
            return (
              <div key={card.title} className={baseClassName} style={cardStyle}>
                {content}
              </div>
            );
          }

          return (
            <ParticleCard
              key={card.title}
              className={baseClassName}
              style={cardStyle}
              disableAnimations={shouldDisableAnimations}
              particleCount={particleCount}
              glowColor={glowColor}
              enableTilt={enableTilt}
              clickEffect={clickEffect}
              enableMagnetism={enableMagnetism}
            >
              {content}
            </ParticleCard>
          );
        })}
      </BentoCardGrid>
    </>
  );
}
