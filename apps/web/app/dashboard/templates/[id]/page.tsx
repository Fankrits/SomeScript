import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { templates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { TemplateDetailsView } from "@/components/template-details-view";

export default async function TemplateDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const { id } = await params;

  const template = await db.query.templates.findFirst({
    where: eq(templates.id, id),
  });

  if (!template) {
    notFound();
  }

  return <TemplateDetailsView template={template} currentUserId={userId} />;
}
