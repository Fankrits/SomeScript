CREATE TABLE "template_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"template_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "template_bookmarks" ADD CONSTRAINT "template_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_bookmarks" ADD CONSTRAINT "template_bookmarks_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_bookmarks_user_id_idx" ON "template_bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "template_bookmarks_user_template_idx" ON "template_bookmarks" USING btree ("user_id","template_id");