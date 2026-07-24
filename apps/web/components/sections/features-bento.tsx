import MagicBento from "@/components/magic-bento/magic-bento";

export function FeaturesBento() {
  return (
    <section id="features" className="w-full max-w-7xl mx-auto px-6 py-20 relative z-10">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-medium font-serif tracking-tight text-foreground">
          Everything You Need to Publish
        </h2>
        <p className="mt-3 text-sm sm:text-base text-foreground/70 font-light max-w-xl mx-auto">
          A single workspace for writing, compiling, and collaborating on research.
        </p>
      </div>

      <MagicBento
        textAutoHide={true}
        enableStars={true}
        enableSpotlight={true}
        enableBorderGlow={true}
        enableTilt={true}
        enableMagnetism={true}
        clickEffect={true}
        spotlightRadius={300}
        particleCount={10}
        glowColor="150, 220, 248"
      />
    </section>
  );
}
