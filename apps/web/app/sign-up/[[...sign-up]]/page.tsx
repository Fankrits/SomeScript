import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans relative">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(15,76,92,0.06),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(229,218,205,0.4),transparent_50%)] pointer-events-none" />

      {/* Left side panel - Aesthetic */}
      <div className="hidden lg:flex lg:w-1/2 bg-secondary/30 relative items-center justify-center p-12 overflow-hidden border-r border-border">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,76,92,0.04),transparent_70%)]" />
        <div className="relative z-10 max-w-md flex flex-col gap-6 text-left">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-6 group">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Home
          </Link>
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="SomeScript Logo" width={40} height={40} className="h-10 w-10 -mr-1" />
            <span className="font-semibold text-xl tracking-tight">SomeScript</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight mt-2 text-foreground">
            Create LaTeX Documents at the speed of thought.
          </h2>
          <p className="text-muted-foreground font-light leading-relaxed">
            Create a free account to access your dashboard, organize documents under workspaces, and compile professional LaTeX papers in real-time.
          </p>
        </div>
      </div>

      {/* Right side - Clerk Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 relative z-10 lg:w-1/2">
        <div className="w-full max-w-[400px] flex flex-col gap-6">
          <div className="lg:hidden flex flex-col items-center gap-4 mb-4 text-center">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors group">
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back to Home
            </Link>
            <div className="flex items-center gap-1.5">
              <Image src="/logo.svg" alt="SomeScript Logo" width={32} height={32} className="h-8 w-8 -mr-1" />
              <span className="font-semibold text-lg tracking-tight">SomeScript</span>
            </div>
          </div>

          <div className="flex justify-center">
            <SignUp
              appearance={{
                elements: {
                  rootBox: "w-full shadow-lg border border-border rounded-xl overflow-hidden bg-card",
                  card: "shadow-none border-none bg-transparent p-6 sm:p-8",
                  headerTitle: "text-foreground font-bold text-xl",
                  headerSubtitle: "text-muted-foreground text-sm font-light",
                  socialButtonsBlockButton: "border border-border text-foreground hover:bg-secondary/40 transition-colors py-2 rounded-lg font-medium",
                  socialButtonsBlockButtonText: "font-semibold text-sm",
                  dividerLine: "bg-border",
                  dividerText: "text-muted-foreground text-xs",
                  formFieldLabel: "text-foreground font-medium text-sm",
                  formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg text-sm shadow-md transition-colors py-2.5",
                  formFieldInput: "border border-border bg-card text-foreground rounded-lg py-2 px-3 text-sm focus:border-primary/40 focus:ring-1 focus:ring-primary/40 focus:outline-none transition-all",
                  footerActionLink: "text-primary hover:text-primary/80 font-semibold transition-colors",
                  identityPreviewText: "text-foreground font-medium",
                  identityPreviewEditButtonIcon: "text-primary",
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
