import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import HeroMockup from "@/components/hero-mockup";
import GridBackgroundDemo from "@/components/grid-background-demo";
import { FinalCta } from "@/components/sections/final-cta";
import { DesktopSection } from "@/components/sections/desktop";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { getRelease } from "@/lib/release";
import { DownloadButton, DownloadVersionLine } from "@/components/download-button";

const FeaturesBento = dynamic(() =>
  import("@/components/sections/features-bento").then((mod) => mod.FeaturesBento),
);
const HowItWorks = dynamic(() =>
  import("@/components/sections/how-it-works").then((mod) => mod.HowItWorks),
);
const Faq = dynamic(() => import("@/components/sections/faq").then((mod) => mod.Faq));

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ landing?: string; desktop?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const allowLanding = params?.landing === "true" || params?.desktop === "true";

  // Signed in? Skip the marketing page and go straight to the dashboard,
  // unless intentionally viewing the landing or desktop download page.
  const { userId } = await auth();
  if (userId && !allowLanding) redirect("/dashboard");

  const release = await getRelease();

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 relative overflow-x-clip">
      {/* Shared Header Component */}
      <Header dark={false} />

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-4 sm:px-6 relative w-full max-w-7xl mx-auto z-10 py-8 lg:py-16 min-h-[calc(100vh-72px)] bg-background overflow-hidden">
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
                  Your AI co-author for flawless math, citations, and typesetting — on the web, or
                  free on your desktop.
                </p>

                {/* CTAs */}
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
                    <DownloadButton
                      release={release}
                      size="lg"
                      className="w-full sm:w-auto px-6 sm:px-8 py-5 rounded-lg text-sm sm:text-base"
                    />
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto px-6 sm:px-8 py-5 rounded-lg text-sm sm:text-base shadow-xs transition-all font-semibold cursor-pointer border-border/80"
                    >
                      <Link href="/dashboard">
                        Start Typesetting Free{" "}
                        <ChevronRight className="ml-1.5 h-4 sm:h-5 w-4 sm:w-5" />
                      </Link>
                    </Button>
                  </div>
                  <DownloadVersionLine release={release} className="mt-1" />
                </div>
              </div>
            }
          />
        </div>
      </section>

      {/* Desktop App Section */}
      <DesktopSection release={release} />

      <main className="flex-1 flex flex-col relative w-full z-10">
        <FeaturesBento />
        <HowItWorks />
        <Faq />
        <FinalCta />
      </main>

      {/* Shared Footer Component */}
      <Footer />
    </div>
  );
}
