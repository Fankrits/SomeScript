import { cn } from "@/lib/utils";

type GridBackgroundDemoProps = {
  className?: string;
};

export default function GridBackgroundDemo({ className }: GridBackgroundDemoProps) {
  return (
    <div className={cn("pointer-events-none", className)} aria-hidden="true">
      <div
        className={cn(
          "absolute inset-0",
          "[background-size:40px_40px]",
          "[background-image:linear-gradient(to_right,rgba(28,46,54,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(28,46,54,0.16)_1px,transparent_1px)]",
        )}
      />
      <div className="absolute inset-0 bg-background [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
    </div>
  );
}
