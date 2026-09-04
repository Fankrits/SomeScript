import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, workspaces } from "@/db/schema";
import { seedWorkspaceDefaults } from "@/lib/limits";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return new Response(
      "Error: Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local",
      {
        status: 500,
      },
    );
  }

  // Get headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error: Missing Svix headers", {
      status: 400,
    });
  }

  // Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  try {
    wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
    evt = payload as WebhookEvent;
  } catch (err) {
    console.error("Error: Could not verify webhook:", err);
    return new Response("Error: Verification failed", {
      status: 400,
    });
  }

  const { id } = evt.data;
  const eventType = evt.type;

  try {
    if (eventType === "user.created" || eventType === "user.updated") {
      const { email_addresses, first_name, last_name, image_url, username: rawUsername } = evt.data;
      const email = email_addresses?.[0]?.email_address;

      if (!id || !email) {
        return new Response("Error: Missing user ID or email", { status: 400 });
      }

      let currentUsername = rawUsername;

      // Automatically set a default username from email if not provided on user.created
      if (eventType === "user.created" && !currentUsername && email) {
        try {
          const secretKey = process.env.CLERK_SECRET_KEY;
          if (secretKey) {
            const { createClerkClient } = await import("@clerk/nextjs/server");
            const clerkClient = createClerkClient({ secretKey });

            let basePrefix = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
            if (basePrefix.length < 4) {
              basePrefix = basePrefix.padEnd(4, "0");
            }
            if (basePrefix.length > 50) {
              basePrefix = basePrefix.slice(0, 50);
            }

            try {
              const updatedUser = await clerkClient.users.updateUser(id, { username: basePrefix });
              currentUsername = updatedUser.username;
            } catch {
              // If username is taken, append random numbers as fallback
              const fallbackUsername = `${basePrefix}_${Math.floor(1000 + Math.random() * 9000)}`;
              const updatedUser = await clerkClient.users.updateUser(id, {
                username: fallbackUsername,
              });
              currentUsername = updatedUser.username;
            }
          }
        } catch (usernameErr) {
          console.error("Failed to auto-assign default username:", usernameErr);
        }
      }

      const fullName =
        currentUsername || [first_name, last_name].filter(Boolean).join(" ") || email.split("@")[0];

      await db
        .insert(users)
        .values({
          id,
          email,
          name: fullName,
          imageUrl: image_url,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email,
            name: fullName,
            imageUrl: image_url,
            updatedAt: new Date(),
          },
        });
    }

    if (eventType === "organization.created" || eventType === "organization.updated") {
      const { name, slug, image_url, created_by } = evt.data;

      if (!id || !name || !slug) {
        return new Response("Error: Missing org ID, name, or slug", { status: 400 });
      }

      await db
        .insert(workspaces)
        .values({
          id,
          name,
          slug,
          imageUrl: image_url,
          ownerId: created_by || null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: workspaces.id,
          set: {
            name,
            slug,
            imageUrl: image_url,
            ownerId: created_by || null,
            updatedAt: new Date(),
          },
        });

      // The owner's first organization starts free; every organization after that
      // is born locked until its own checkout completes — see seedWorkspaceDefaults.
      if (eventType === "organization.created" && created_by) {
        await seedWorkspaceDefaults(id, created_by);
      }
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (dbErr) {
    console.error("Database sync failed inside clerk webhook handler:", dbErr);
    return new Response("Error: Database sync failed", { status: 500 });
  }
}
