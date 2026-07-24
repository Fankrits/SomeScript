"use client";

import { useRef, useEffect, useCallback, useState, type ReactNode, type CSSProperties } from "react";
import { gsap } from "gsap";
import { CheckCircle2 } from "lucide-react";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";
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
    label: "Eve AI",
    title: "AI Generation",
    description: "Draft outlines, equations, and citations from a single prompt.",
  },
  {
    label: "Compiler",
    title: "Tectonic Compilation",
    description: "Fast, on-demand LaTeX compilation running directly in your browser.",
  },
  {
    label: "Preview",
    title: "Live PDF Preview",
    description:
      "Watch your document typeset in real time, with instant equation rendering and page-accurate layout as you write.",
  },
  {
    label: "Citations",
    title: "Citation Management",
    description:
      "Organize references and bibliographies alongside your document, kept in sync with your .bib files.",
  },
  {
    label: "Teamwork",
    title: "Workspace Collaboration",
    description: "Share projects with co-authors under isolated, permissioned workspaces.",
  },
  {
    label: "History",
    title: "Version History",
    description: "Every compile is saved, so you can roll back with confidence.",
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

const CitationNetwork = () => {
  const nodes = [
    { x: 34, y: 30, d: "0s" },
    { x: 40, y: 92, d: "0.25s" },
    { x: 112, y: 20, d: "0.5s" },
    { x: 186, y: 40, d: "0.75s" },
    { x: 176, y: 98, d: "1s" },
  ];
  return (
    <svg viewBox="0 0 220 120" fill="none" preserveAspectRatio="xMidYMid meet">
      {nodes.map((n, i) => (
        <line
          key={`l${i}`}
          x1="110"
          y1="60"
          x2={n.x}
          y2={n.y}
          stroke="#0f4c5c"
          strokeOpacity="0.45"
          strokeWidth="1.5"
          strokeDasharray="220"
          strokeDashoffset="220"
          className="bento-draw"
          style={{ animationDelay: n.d }}
        />
      ))}
      {nodes.map((n, i) => (
        <circle key={`n${i}`} cx={n.x} cy={n.y} r="5" fill="#1f7ea6" className="bento-pop" style={{ animationDelay: n.d }} />
      ))}
      <circle cx="110" cy="60" r="9" fill="#0f4c5c" />
      <circle
        cx="110"
        cy="60"
        r="9"
        fill="none"
        stroke="#0f4c5c"
        strokeWidth="2"
        className="bento-ring"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  );
};

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

const CardVisual = ({ index }: { index: number }) => {
  switch (index) {
    case 0: // AI Generation — generating lines with a caret
      return (
        <div className="w-full space-y-2">
          <div className="h-1.5 w-[68%] rounded-full bg-[#0f4c5c]/70 bento-shimmer" style={{ animationDelay: "0s" }} />
          <div className="h-1.5 w-[90%] rounded-full bg-[#1c2e36]/15 bento-shimmer" style={{ animationDelay: "0.3s" }} />
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-[45%] rounded-full bg-[#1c2e36]/15 bento-shimmer" style={{ animationDelay: "0.6s" }} />
            <span className="h-3 w-[2px] bg-[#dd7e21] bento-blink" />
          </div>
        </div>
      );
    case 1: // Tectonic Compilation — progress bar filling to success
      return (
        <div className="w-full">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] text-[#1c2e36]/40">
            <span>tectonic build</span>
            <CheckCircle2 className="h-3 w-3 text-[#1f9563] bento-pop" />
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1c2e36]/10">
            <div className="h-full rounded-full bg-[#1f9563] bento-fill" />
          </div>
        </div>
      );
    case 2: // Live PDF Preview — animated function graph
      return <SineGraph />;
    case 3: // Citation Management — reference network
      return <CitationNetwork />;
    case 4: // Workspace Collaboration — live presence
      return (
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-[#0f4c5c] text-[9px] font-semibold text-white">PR</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-[#dd7e21] text-[9px] font-semibold text-white">MK</span>
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-[#1f7ea6] text-[9px] font-semibold text-white">
              SB
              <span className="absolute inset-0 rounded-full border-2 border-[#1f7ea6] bento-ring" />
            </span>
          </div>
          <span className="text-[11px] text-[#1c2e36]/50">+3 online</span>
        </div>
      );
    case 5: // Version History — commit graph
      return <CommitGraph />;
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
