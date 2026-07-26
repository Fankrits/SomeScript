import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroMockup from "@/components/hero-mockup";
import GridBackgroundDemo from "@/components/grid-background-demo";
import { FinalCta } from "@/components/sections/final-cta";
import Header from "@/components/header";
import Footer from "@/components/footer";

const FeaturesBento = dynamic(() => import("@/components/sections/features-bento").then((mod) => mod.FeaturesBento));
const HowItWorks = dynamic(() => import("@/components/sections/how-it-works").then((mod) => mod.HowItWorks));
const Testimonials = dynamic(() => import("@/components/sections/testimonials").then((mod) => mod.Testimonials));
const Faq = dynamic(() => import("@/components/sections/faq").then((mod) => mod.Faq));

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 relative overflow-x-clip">
      {/* Shared Header Component */}
      <Header dark={false} />

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-6 relative w-full max-w-7xl mx-auto z-10 py-6 lg:h-[calc(100svh-72px)] bg-background overflow-hidden">
        <GridBackgroundDemo className="absolute inset-0" />
        <div className="w-full max-w-6xl">
          <HeroMockup
            overlay={
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
                {/* Heading */}
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium font-serif tracking-tight leading-tight text-foreground">
                  Research Deserves
                  <br />
                  Perfection.
                </h1>

                {/* Paragraph */}
                <p className="text-sm sm:text-base text-foreground/80 leading-relaxed font-light max-w-xl">
                  Your AI co-author for flawless math, citations, and typesetting.
                </p>

                {/* CTA */}
                <div className="flex w-full justify-center">
                  <Button asChild size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-5 rounded-lg text-base shadow-lg shadow-primary/15 transition-all font-semibold cursor-pointer">
                    <Link href="/dashboard">
                      Start Typesetting Free <ChevronRight className="ml-1.5 h-5 w-5" />
                    </Link>
                  </Button>
                </div>
              </div>
            }
          />
        </div>
      </section>

      <main className="flex-1 flex flex-col relative w-full z-10">
        <FeaturesBento />
        <HowItWorks />
        <Testimonials />
        <Faq />
        <FinalCta />
      </main>

      {/* Shared Footer Component */}
      <Footer />
    </div>
  );
}
