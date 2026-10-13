// Stands in for @sentry/nextjs and next/navigation. Nothing leaves the machine.
export const usePathname = () => window.location.pathname;

export const init = () => {};
export const captureException = () => "";
export const captureMessage = () => "";
export const addBreadcrumb = () => {};
export const setTag = () => {};
export const setUser = () => {};
export const withScope = (fn: (scope: unknown) => void) => fn({});
