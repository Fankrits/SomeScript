"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { CREDIT_PACKS, TEAM_MIN_SEATS } from "@/lib/plans";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const PRICE_IDS: Record<"pro" | "team", string> = {
  pro: process.env.STRIPE_PRICE_PRO ?? "",
  team: process.env.STRIPE_PRICE_TEAM ?? "",
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

/** Creates a subscription Checkout Session for the active workspace. Returns the URL to redirect to. */
export async function createCheckoutSession(plan: "pro" | "team"): Promise<{ url: string }> {
  const priceId = PRICE_IDS[plan];
  if (!priceId) throw new Error(`Missing STRIPE_PRICE_${plan.toUpperCase()} env var`);

  const { workspaceId, email } = await getActiveWorkspace();
  const customerId = await getOrCreateStripeCustomer(workspaceId, email);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: plan === "team" ? TEAM_MIN_SEATS : 1 }],
    success_url: `${APP_URL}/dashboard?checkout=success`,
    cancel_url: `${APP_URL}/dashboard?checkout=cancelled`,
    metadata: { workspaceId, plan },
    subscription_data: { metadata: { workspaceId, plan } },
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return { url: session.url };
}

/** Creates a one-time Checkout Session for a credit top-up pack. Returns the URL to redirect to. */
export async function createTopUpCheckout(packId: (typeof CREDIT_PACKS)[number]["id"]): Promise<{ url: string }> {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown credit pack");

  const { workspaceId, email } = await getActiveWorkspace();
  const customerId = await getOrCreateStripeCustomer(workspaceId, email);

  const session = await stripe.checkout.sessions.create({
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
    success_url: `${APP_URL}/dashboard?checkout=success`,
    cancel_url: `${APP_URL}/dashboard?checkout=cancelled`,
    metadata: { workspaceId, type: "credit_pack", packId: pack.id, credits: String(pack.credits) },
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return { url: session.url };
}

/** Creates a Stripe Billing Portal session (self-serve cancel/manage). Returns the URL to redirect to. */
export async function createPortalSession(): Promise<{ url: string }> {
  const { workspaceId } = await getActiveWorkspace();
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });
  if (!existing?.stripeCustomerId) throw new Error("No billing account for this workspace yet");

  const session = await stripe.billingPortal.sessions.create({
    customer: existing.stripeCustomerId,
    return_url: `${APP_URL}/dashboard`,
  });
  return { url: session.url };
}
