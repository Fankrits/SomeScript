"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  getBillingSummary,
  getBillingDetails,
  createCardSetupCheckout,
  setSubscriptionCancel,
} from "@/app/dashboard/billing-actions";
import { CheckoutForm } from "@/components/checkout-form";
import { PLAN_LIMITS } from "@/lib/plans";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", team: "Team" };
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  canceled: "Canceled",
};

type Summary = Awaited<ReturnType<typeof getBillingSummary>>;
type Details = Awaited<ReturnType<typeof getBillingDetails>>;

// Plain label/value row, no card or badge chrome — matches the row layout Clerk's
// own General/Members pages use ("Profile ... Update profile") so this blends into
// the modal instead of looking like a dropped-in app widget.
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-4 last:border-b-0">
      <span className="text-sm text-gray-700">{label}</span>
      <span className="text-sm text-gray-950">{children}</span>
    </div>
  );
}

function LinkButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-sm font-medium text-gray-950 hover:underline disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function BillingPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const load = useCallback(() => {
    const fail = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Failed to load billing info");
    getBillingSummary().then(setSummary).catch(fail);
    // Separate from the summary: this one hits the Stripe API, so a Stripe outage
    // shouldn't blank out the plan/credit rows that come from our own database.
    getBillingDetails().then(setDetails).catch(fail);
  }, []);

  useEffect(load, [load]);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateCard = () =>
    run(async () => {
      const { clientSecret } = await createCardSetupCheckout();
      setSetupSecret(clientSecret);
    }, "Failed to start card update");

  const handleCancel = (cancel: boolean) =>
    run(async () => {
      await setSubscriptionCancel(cancel);
      setConfirmingCancel(false);
      // The webhook writes the local row, so re-read rather than guessing the new state.
      setTimeout(load, 1500);
    }, "Failed to update subscription");

  if (error && !summary) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!summary) return <Loader2 className="m-4 h-5 w-5 animate-spin text-gray-400" />;

  if (setupSecret) {
    return (
      <div className="flex flex-col gap-4 py-2">
        <button
          onClick={() => setSetupSecret(null)}
          className="flex items-center gap-1.5 self-start text-sm text-gray-500 hover:text-gray-950"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <CheckoutForm
          clientSecret={setupSecret}
          submitLabel="Save card"
          onSuccess={() => {
            setSetupSecret(null);
            load();
          }}
        />
      </div>
    );
  }

  const { plan, status, currentPeriodEnd, cancelAtPeriodEnd, credits, purchasedCredits } = summary;
  const card = details?.card;
  const invoices = details?.invoices ?? [];

  return (
    <div className="flex flex-col">
      <Row label="Plan">{PLAN_LABEL[plan] ?? plan}</Row>
      <Row label="Members">
        {PLAN_LIMITS[plan].maxMembers === Infinity
          ? "Unlimited"
          : `Up to ${PLAN_LIMITS[plan].maxMembers}`}
      </Row>
      {plan !== "free" && <Row label="Status">{STATUS_LABEL[status] ?? status}</Row>}
      {currentPeriodEnd && (
        <Row label={cancelAtPeriodEnd ? "Cancels" : "Renews"}>
          {new Date(currentPeriodEnd).toLocaleDateString()}
        </Row>
      )}
      <Row label="AI credits">
        {credits.toLocaleString()} available
        {purchasedCredits > 0 && ` (${purchasedCredits.toLocaleString()} purchased)`}
      </Row>

      <div className="flex items-center justify-between border-b border-gray-100 py-4">
        <span className="text-sm text-gray-700">Payment method</span>
        <span className="flex items-center gap-3">
          {!details ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <span className="text-sm text-gray-950">
              {card ? (
                <>
                  <span className="capitalize">{card.brand}</span> •••• {card.last4}
                  <span className="ml-2 text-gray-500">
                    {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
                  </span>
                </>
              ) : (
                <span className="text-gray-500">None</span>
              )}
            </span>
          )}
          <LinkButton onClick={handleUpdateCard} disabled={busy}>
            {card ? "Update" : "Add card"}
          </LinkButton>
        </span>
      </div>

      <div className="border-b border-gray-100 py-4 last:border-b-0">
        <span className="text-sm text-gray-700">Invoices</span>
        {invoices.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No invoices yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-700">
                  {inv.created.toLocaleDateString()}
                  <span className="ml-2 text-gray-400">{inv.number ?? inv.id}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-gray-950">${inv.amountUsd.toFixed(2)}</span>
                  <span className="capitalize text-gray-500">{inv.status}</span>
                  {/* Stripe-hosted PDF: a document download, not a portal handoff —
                      there's no invoice-rendering to replicate in-app. */}
                  {inv.pdfUrl && (
                    <a
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-500 hover:text-gray-950"
                      aria-label="Download invoice PDF"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {plan !== "free" && status !== "canceled" && (
        <div className="flex items-center justify-between py-4">
          <span className="text-sm text-gray-700">
            {cancelAtPeriodEnd ? "Subscription ends at period end" : "Cancel subscription"}
          </span>
          {cancelAtPeriodEnd ? (
            <LinkButton onClick={() => handleCancel(false)} disabled={busy}>
              Resume
            </LinkButton>
          ) : confirmingCancel ? (
            <span className="flex items-center gap-3">
              <button
                onClick={() => handleCancel(true)}
                disabled={busy}
                className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {busy ? "Cancelling…" : "Confirm"}
              </button>
              <LinkButton onClick={() => setConfirmingCancel(false)}>Keep</LinkButton>
            </span>
          ) : (
            <LinkButton onClick={() => setConfirmingCancel(true)} disabled={busy}>
              Cancel plan
            </LinkButton>
          )}
        </div>
      )}

      {error && <p className="pt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
