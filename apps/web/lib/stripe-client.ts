import { loadStripe, type Stripe } from "@stripe/stripe-js";

// loadStripe() fetches stripe.js on first call and caches the script tag itself,
// but memoizing the promise here avoids re-invoking it (and its own internal
// warnings) on every re-render of a component that calls this.
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
