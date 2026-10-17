import { redirect } from "next/navigation";

export default function DesktopPage() {
  redirect("/?desktop=true#desktop");
}
