"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { subscriptions, creditBalances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { CREDIT_PACKS, PLAN_LIMITS, type BillingCadence, type Plan } from "@/lib/plans";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const PRICE_IDS: Record<"pro" | "team", Record<BillingCadence, string>> = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO ?? "",
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "",
  },
  team: {
    monthly: process.env.STRIPE_PRICE_TEAM ?? "",
    annual: process.env.STRIPE_PRICE_TEAM_ANNUAL ?? "",
  },
};

async function getActiveWorkspace(): Promise<{ workspaceId: string; email: string }> {
  const { userId, orgId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error("No email on account");
  return { workspaceId: orgId || userId, email };
}

async function getOrCreateStripeCustomer(workspaceId: string, email: string): Promise<string> {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({ email, metadata: { workspaceId } });
  await db
    .insert(subscriptions)
    .values({ workspaceId, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: subscriptions.workspaceId,
      set: { stripeCustomerId: customer.id, updatedAt: new Date() },
    });
  return customer.id;
}

/**
 * Creates a Checkout Session in `ui_mode: "elements"` for the active workspace's
 * subscription and returns its client secret, for the client to mount the Payment
 * Element in-page via CheckoutElementsProvider (no redirect to checkout.stripe.com).
 * Per Stripe's own guidance, Checkout Sessions are preferred over driving a Subscription
 * + PaymentIntent by hand — Checkout owns the invoice/PaymentIntent wiring internally,
 * which sidesteps API-version-dependent quirks there (e.g. `latest_invoice.confirmation_secret`
 * not always being populated, forcing a manual invoice.payments lookup).
 * `subscription_data.metadata` tags the underlying Subscription object itself (Checkout
 * doesn't propagate session-level metadata to it automatically) — the webhook's
 * customer.subscription.created/updated handler reads it from there, unchanged by ui_mode.
 */
export async function createSubscriptionCheckout(
  plan: "pro" | "team",
  cadence: BillingCadence = "monthly",
): Promise<{ clientSecret: string }> {
  const priceId = PRICE_IDS[plan][cadence];
  if (!priceId) {
    const suffix = cadence === "annual" ? "_ANNUAL" : "";
    throw new Error(`Missing STRIPE_PRICE_${plan.toUpperCase()}${suffix} env var`);
  }

  const { workspaceId, email } = await getActiveWorkspace();
  const customerId = await getOrCreateStripeCustomer(workspaceId, email);

  const session = await stripe.checkout.sessions.create({
    ui_mode: "elements",
    mode: "subscription",
    customer: customerId,
    // Always 1: Team is a flat band up to PLAN_LIMITS.team.maxMembers, not a seat
    // count, so nothing here multiplies by headcount.
    line_items: [{ price: priceId, quantity: 1 }],
    saved_payment_method_options: {
      allow_redisplay_filters: ["always", "limited", "unspecified"],
    },
    return_url: `${APP_URL}/dashboard?checkout=success`,
    metadata: { workspaceId, plan },
    subscription_data: { metadata: { workspaceId, plan } },
  });

  if (!session.client_secret)
    throw new Error("Stripe did not return a Checkout Session client secret");
  return { clientSecret: session.client_secret };
}

/** Same `ui_mode: "elements"` Checkout Session, in one-time `mode: "payment"` for a credit top-up pack. */
export async function createTopUpCheckout(
  packId: (typeof CREDIT_PACKS)[number]["id"],
): Promise<{ clientSecret: string }> {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown credit pack");

  const { workspaceId, email } = await getActiveWorkspace();
  const customerId = await getOrCreateStripeCustomer(workspaceId, email);

  const session = await stripe.checkout.sessions.create({
    ui_mode: "elements",
    mode: "payment",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: pack.priceUsd * 100,
          product_data: { name: `${pack.credits} AI credits` },
        },
        quantity: 1,
      },
    ],
    // Without this the customer re-types a card they already have on file: Checkout
    // only redisplays saved methods marked `allow_redisplay: "always"`, and a card
    // saved by a subscription checkout is marked "limited" (merchant-initiated). This
    // is the filter Stripe documents for surfacing it in a customer-initiated purchase.
    saved_payment_method_options: {
      allow_redisplay_filters: ["always", "limited", "unspecified"],
    },
    return_url: `${APP_URL}/dashboard?checkout=success`,
    metadata: { workspaceId, type: "credit_pack", packId: pack.id, credits: String(pack.credits) },
  });

  if (!session.client_secret)
    throw new Error("Stripe did not return a Checkout Session client secret");
  return { clientSecret: session.client_secret };
}

/**
 * Same `ui_mode: "elements"` Checkout Session in `mode: "setup"` — the in-app
 * replacement for the Billing Portal's "update card" screen. Reusing Checkout
 * rather than hand-rolling a SetupIntent + `<Elements>` tree means the existing
 * CheckoutForm mounts it unchanged. The resulting payment method is promoted to
 * the customer's (and the live subscription's) default by the webhook's
 * `checkout.session.completed` / `mode === "setup"` branch.
 *
 * Lazily creates the Stripe customer if this workspace has never checked out — a
 * free workspace should be able to add a card in advance.
 */
export async function createCardSetupCheckout(): Promise<{ clientSecret: string }> {
  const { workspaceId, email } = await getActiveWorkspace();
  const customerId = await getOrCreateStripeCustomer(workspaceId, email);

  const session = await stripe.checkout.sessions.create({
    ui_mode: "elements",
    mode: "setup",
    currency: "usd",
    customer: customerId,
    return_url: `${APP_URL}/dashboard`,
    metadata: { workspaceId, type: "card_update" },
  });

  if (!session.client_secret)
    throw new Error("Stripe did not return a Checkout Session client secret");
  return { clientSecret: session.client_secret };
}

export type BillingCard = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null;

export type BillingInvoice = {
  id: string;
  number: string | null;
  created: Date;
  amountUsd: number;
  status: string;
  pdfUrl: string | null;
};

/**
 * The two things the Billing Portal was being redirected to for: the default card
 * and recent invoices. Read straight from Stripe rather than mirrored into Postgres
 * — invoices are display-only here, and a stale local copy would be worse than a
 * live read on a panel that's opened rarely.
 */
export async function getBillingDetails(): Promise<{
  card: BillingCard;
  invoices: BillingInvoice[];
}> {
  const { workspaceId } = await getActiveWorkspace();
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });
  // No customer yet = never checked out. Nothing to show, and creating one just to
  // render an empty panel would litter Stripe with customers for every free workspace.
  if (!sub?.stripeCustomerId) return { card: null, invoices: [] };

  const [customer, invoices] = await Promise.all([
    stripe.customers.retrieve(sub.stripeCustomerId, {
      expand: ["invoice_settings.default_payment_method"],
    }),
    stripe.invoices.list({ customer: sub.stripeCustomerId, limit: 12 }),
  ]);

  // Checkout's subscription flow attaches the card to the Subscription, and only
  // createCardSetupCheckout's webhook promotes it onto the customer — so reading
  // invoice_settings alone reports "None" for anyone who paid through Checkout and
  // never touched the card since. Fall back to whatever card is actually attached.
  let defaultPm =
    !customer.deleted && typeof customer.invoice_settings?.default_payment_method === "object"
      ? customer.invoice_settings.default_payment_method
      : null;

  if (!defaultPm) {
    const attached = await stripe.paymentMethods.list({
      customer: sub.stripeCustomerId,
      type: "card",
      limit: 1,
    });
    defaultPm = attached.data[0] ?? null;
  }

  return {
    card: defaultPm?.card
      ? {
          brand: defaultPm.card.brand,
          last4: defaultPm.card.last4,
          expMonth: defaultPm.card.exp_month,
          expYear: defaultPm.card.exp_year,
        }
      : null,
    invoices: invoices.data.map((inv) => ({
      id: inv.id ?? "",
      number: inv.number,
      created: new Date(inv.created * 1000),
      amountUsd: inv.amount_paid / 100,
      status: inv.status ?? "unknown",
      pdfUrl: inv.invoice_pdf ?? null,
    })),
  };
}

/**
 * Cancel at period end, or undo that. Never an immediate cancel: the workspace has
 * paid through the period, and `assertWorkspaceActive` would lock it out the moment
 * the webhook lands. Stripe emits `customer.subscription.updated` either way, so the
 * local row follows from the webhook rather than being written twice.
 */
export async function setSubscriptionCancel(cancel: boolean): Promise<void> {
  const { workspaceId } = await getActiveWorkspace();
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });
  if (!sub?.stripeSubscriptionId) throw new Error("No active subscription to change");

  await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: cancel });
}

/**
 * Plan/credit snapshot for the active workspace. Called from the Billing panel
 * embedded in Clerk's OrganizationSwitcher modal — that panel runs inside
 * OrganizationSwitcher's client tree, so it can't query the DB directly and needs
 * this as a callable server action instead.
 */
export async function getBillingSummary(): Promise<{
  plan: Plan;
  status: "active" | "trialing" | "past_due" | "canceled";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: Date | null;
  credits: number;
  purchasedCredits: number;
}> {
  const { workspaceId } = await getActiveWorkspace();
  const [sub, creditBalance] = await Promise.all([
    db.query.subscriptions.findFirst({ where: eq(subscriptions.workspaceId, workspaceId) }),
    db.query.creditBalances.findFirst({ where: eq(creditBalances.workspaceId, workspaceId) }),
  ]);

  const plan = sub?.plan ?? "free";
  const included = creditBalance?.includedBalance ?? PLAN_LIMITS[plan].monthlyAiCredits;
  const purchased = creditBalance?.purchasedBalance ?? 0;

  return {
    plan,
    status: sub?.status ?? "active",
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? null,
    credits: included + purchased,
    purchasedCredits: purchased,
  };
}
