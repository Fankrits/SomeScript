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
    return_url: `${APP_URL}/dashboard?checkout=success`,
    metadata: { workspaceId, type: "credit_pack", packId: pack.id, credits: String(pack.credits) },
  });

  if (!session.client_secret)
    throw new Error("Stripe did not return a Checkout Session client secret");
  return { clientSecret: session.client_secret };
}

/**
 * Creates a Stripe Billing Portal session (self-serve card management, invoice
 * history, cancel) and returns the URL to redirect to. Lazily creates the Stripe
 * customer if this workspace has never checked out — a free workspace should be
 * able to add a card in advance, not just after its first upgrade attempt.
 */
export async function createPortalSession(): Promise<{ url: string }> {
  const { workspaceId, email } = await getActiveWorkspace();
  const customerId = await getOrCreateStripeCustomer(workspaceId, email);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/dashboard`,
  });
  return { url: session.url };
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
