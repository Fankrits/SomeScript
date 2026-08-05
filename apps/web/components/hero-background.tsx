import React from "react";

export default function HeroBackground({ className = "" }: { className?: string }) {
  return (
    <div
      className={`fixed inset-0 z-0 overflow-hidden pointer-events-none bg-background ${className}`}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 w-full h-full opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 10% 25%, rgba(15,76,92,0.05) 0%, transparent 45%), radial-gradient(circle at 90% 75%, rgba(221,126,33,0.05) 0%, transparent 45%)",
        }}
      />
    </div>
  );
}
