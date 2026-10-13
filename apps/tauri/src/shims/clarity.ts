// Replaces apps/editor's Microsoft Clarity wrapper. The desktop app sends no analytics.
export function trackEvent(_name: string) {}
export function upgradeSession(_reason: string) {}
export function ClarityAnalytics() {
  return null;
}
