import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PublishTemplateView } from "@/components/publish-template-view";

export default async function NewTemplatePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  return <PublishTemplateView />;
}
