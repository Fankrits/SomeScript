CREATE TYPE "public"."credit_transaction_reason" AS ENUM('monthly_grant', 'purchase', 'usage', 'adjustment');--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"included_balance" integer DEFAULT 0 NOT NULL,
	"purchased_balance" integer DEFAULT 0 NOT NULL,
	"period_reset_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" "credit_transaction_reason" NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_transactions_workspace_id_idx" ON "credit_transactions" USING btree ("workspace_id");