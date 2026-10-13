import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Options = { ssr?: boolean; loading?: () => ReactNode };
type Loaded<P> = ComponentType<P> | { default: ComponentType<P> };

/** Vite stand-in for next/dynamic: React.lazy + Suspense, honoring `loading`. */
export default function dynamic<P extends object>(
  loader: () => Promise<Loaded<P>>,
  options: Options = {},
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const m = await loader();
    return "default" in m ? m : { default: m };
  });
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={options.loading?.() ?? null}>
        <Lazy {...(props as React.ComponentProps<typeof Lazy>)} />
      </Suspense>
    );
  };
}
