import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuroraText } from "@/components/ui/aurora-text";

export function FinalCta() {
  return (
    <section className="w-full max-w-7xl mx-auto px-6 py-20 relative z-10 border-t border-border/40">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-medium font-serif tracking-tight leading-tight text-white">
          <AuroraText colors={["#dd7e21", "#0f4c5c", "#8da0ce", "#dd7e21"]}>
            Start Writing Perfect Research Today
          </AuroraText>
        </h2>
        <p className="text-sm sm:text-base text-white/80 leading-relaxed font-light max-w-xl">
          Join researchers using SomeScript for flawless math, citations, and typesetting.
        </p>
        <div className="flex w-full justify-center">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-5 rounded-lg text-base shadow-lg shadow-primary/15 transition-all font-semibold cursor-pointer"
          >
            <Link href="/dashboard">
              Start Typesetting Free <ChevronRight className="ml-1.5 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
