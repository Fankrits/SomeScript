import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions, creditBalances, creditTransactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { syncWorkspaceMemberLimit } from "@/lib/limits";
import { PLAN_LIMITS } from "@/lib/plans";

// Stripe's full status enum has a few values our own `subscription_status` doesn't
// need to distinguish — everything that isn't "paying fine" collapses to past_due
// (restricted, not wiped) except Stripe's own terminal "canceled"/"incomplete_expired".
function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "trialing" | "past_due" | "canceled" {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "past_due";
}

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription): Promise<void> {
  const workspaceId = sub.metadata.workspaceId;
  const plan = sub.metadata.plan;
  if (!workspaceId || (plan !== "pro" && plan !== "team")) {
    console.error("[stripe webhook] subscription missing workspaceId/plan metadata:", sub.id);
    return;
  }

  const item = sub.items.data[0];
  const seats = plan === "team" ? (item?.quantity ?? null) : null;

  await db
    .update(subscriptions)
    .set({
      plan,
      status: mapStripeStatus(sub.status),
      seats,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.workspaceId, workspaceId));

  await syncWorkspaceMemberLimit(workspaceId, plan, seats);
}

async function downgradeToFree(sub: Stripe.Subscription): Promise<void> {
  const workspaceId = sub.metadata.workspaceId;
  if (!workspaceId) {
    console.error("[stripe webhook] canceled subscription missing workspaceId metadata:", sub.id);
    return;
  }

  await db
    .update(subscriptions)
    .set({ plan: "free", status: "canceled", seats: null, cancelAtPeriodEnd: null, updatedAt: new Date() })
    .where(eq(subscriptions.workspaceId, workspaceId));

  await syncWorkspaceMemberLimit(workspaceId, "free", null);
}

async function creditTopUp(session: Stripe.Checkout.Session, eventId: string): Promise<void> {
  const workspaceId = session.metadata?.workspaceId;
  const credits = Number(session.metadata?.credits);
  if (!workspaceId || !Number.isFinite(credits) || credits <= 0) {
    console.error("[stripe webhook] top-up session missing workspaceId/credits metadata:", session.id);
    return;
  }

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(creditTransactions)
      .values({
        workspaceId,
        delta: credits,
        reason: "purchase",
        description: `Stripe top-up: ${session.metadata?.packId ?? "unknown pack"}`,
        stripeEventId: eventId,
      })
      .onConflictDoNothing({ target: creditTransactions.stripeEventId })
      .returning({ id: creditTransactions.id });

    // Redelivery of an already-processed event — the ledger row exists, so the
    // balance was already credited. Skip, or a retry would double-credit it.
    if (inserted.length === 0) return;

    // A personal (non-org) workspace never gets a credit_balances row seeded — see
    // seedWorkspaceDefaults — so its first-ever top-up would hit a bare UPDATE that
    // matches zero rows and silently vanishes. Upsert instead. includedBalance on
    // first insert mirrors getWorkspaceSubscription's "no row = plan's default
    // allowance" fallback, so creating the row here can't regress what the user
    // already had.
    const sub = await tx.query.subscriptions.findFirst({ where: eq(subscriptions.workspaceId, workspaceId) });
    const plan = sub?.plan ?? "free";

    await tx
      .insert(creditBalances)
      .values({
        workspaceId,
        includedBalance: PLAN_LIMITS[plan].monthlyAiCredits,
        purchasedBalance: credits,
        periodResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoUpdate({
        target: creditBalances.workspaceId,
        set: { purchasedBalance: sql`${creditBalances.purchasedBalance} + ${credits}`, updatedAt: new Date() },
      });
  });
}

export async function POST(req: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Error: STRIPE_WEBHOOK_SECRET is not set", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Error: Missing stripe-signature header", { status: 400 });
  }

  // Signature verification needs the exact raw bytes Stripe signed — read as text,
  // never parse-then-restringify (that can change formatting and break the check).
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Error: Could not verify Stripe webhook:", err);
    return new Response("Error: Verification failed", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "payment") {
          await creditTopUp(session, event.id);
        }
        // Subscription mode is handled by customer.subscription.created/updated below,
        // which carries the same subscription_data.metadata set at Checkout creation.
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await upsertSubscriptionFromStripe(event.data.object);
        break;
      case "customer.subscription.deleted":
        await downgradeToFree(event.data.object);
        break;
    }
    return new Response("Webhook processed successfully", { status: 200 });
  } catch (err) {
    console.error("Database sync failed inside stripe webhook handler:", err);
    return new Response("Error: Database sync failed", { status: 500 });
  }
}
