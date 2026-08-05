"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getBillingSummary, createPortalSession } from "@/app/dashboard/billing-actions";
import { Loader2 } from "lucide-react";

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", team: "Team" };
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  canceled: "Canceled",
};

type Summary = Awaited<ReturnType<typeof getBillingSummary>>;

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

export function BillingPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    getBillingSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load billing info"));
  }, []);

  const handleManageBilling = async () => {
    setError(null);
    setPortalLoading(true);
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
      setPortalLoading(false);
    }
  };

  if (error && !summary) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!summary) return <Loader2 className="m-4 h-5 w-5 animate-spin text-gray-400" />;

  const { plan, status, seats, currentPeriodEnd, cancelAtPeriodEnd, credits, purchasedCredits } =
    summary;

  return (
    <div className="flex flex-col">
      <Row label="Plan">{PLAN_LABEL[plan] ?? plan}</Row>
      {plan !== "free" && (
        <Row label="Status">
          {STATUS_LABEL[status] ?? status}
          {seats ? ` · ${seats} seats` : ""}
        </Row>
      )}
      {currentPeriodEnd && (
        <Row label={cancelAtPeriodEnd ? "Cancels" : "Renews"}>
          {new Date(currentPeriodEnd).toLocaleDateString()}
        </Row>
      )}
      <Row label="AI credits">
        {credits.toLocaleString()} available
        {purchasedCredits > 0 && ` (${purchasedCredits.toLocaleString()} purchased)`}
      </Row>
      <div className="flex items-center justify-between py-4">
        <span className="text-sm text-gray-700">Payment methods &amp; invoices</span>
        <button
          onClick={handleManageBilling}
          disabled={portalLoading}
          className="text-sm font-medium text-gray-950 hover:underline disabled:opacity-50"
        >
          {portalLoading ? "Opening…" : "Manage billing"}
        </button>
      </div>
      {error && <p className="pt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
