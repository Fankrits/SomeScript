"use client";

import { useState, type FormEvent } from "react";
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { getStripe } from "@/lib/stripe-client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";

// Stripe's webhook fires asynchronously after confirm() resolves, not before — this
// just gives it a moment to land before the parent refreshes server-fetched plan/credit
// data. A fixed delay, not a poll-until-consistent loop: fine as long as the local
// `stripe listen` forwarder is running (it delivers sub-second in practice); if it's
// ever not, no delay here would help anyway since the event never arrives at all.
const WEBHOOK_SETTLE_DELAY_MS = 1500;

function ConfirmForm({ onSuccess }: { onSuccess: () => void }) {
  const checkoutState = useCheckoutElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  if (checkoutState.type === "loading") {
    return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  }
  if (checkoutState.type === "error") {
    return <p className="text-sm text-destructive">{checkoutState.error.message}</p>;
  }

  const { checkout } = checkoutState;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // redirect: "if_required" keeps the customer in the drawer for card payments —
    // Checkout only navigates away if the chosen payment method itself requires it
    // (e.g. a bank redirect), using the return_url set on the Session server-side.
    const result = await checkout.confirm({ redirect: "if_required" });

    if (result.type === "error") {
      setError(result.error.message);
      setSubmitting(false);
      return;
    }

    setSucceeded(true);
    setTimeout(onSuccess, WEBHOOK_SETTLE_DELAY_MS);
  };

  if (succeeded) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-primary" />
        <p className="text-sm font-medium text-foreground">Payment successful</p>
        <p className="text-xs text-muted-foreground">Updating your workspace…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement options={{ fields: { billingDetails: { name: "always" } } }} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={!checkout.canConfirm || submitting} className="w-full">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay"}
      </Button>
      {/* checkout.canConfirm only flips true once every required field (incl. name above)
          reports complete — without this, a stuck-incomplete Payment Element just makes
          the button silently unclickable with zero indication why. */}
      {!checkout.canConfirm && !submitting && (
        <p className="text-center text-xs text-muted-foreground">Complete the payment details above to continue.</p>
      )}
    </form>
  );
}

/** Mounts a Checkout Session's (`ui_mode: "elements"`) Payment Element in-page — no redirect to checkout.stripe.com. */
export function CheckoutForm({ clientSecret, onSuccess }: { clientSecret: string; onSuccess: () => void }) {
  return (
    <CheckoutElementsProvider stripe={getStripe()} options={{ clientSecret, elementsOptions: { appearance: { theme: "stripe" } } }}>
      <ConfirmForm onSuccess={onSuccess} />
    </CheckoutElementsProvider>
  );
}
