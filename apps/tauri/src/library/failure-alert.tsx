import type { ComponentProps, ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiFailure } from "./api";

/**
 * A failure shown where it happened, with what the user can try. A toast is gone before it can be
 * read, let alone acted on, and folder problems (a blocked Documents folder, a drive that isn't
 * there) are exactly the ones that need a next step.
 */
export function FailureAlert({
  title,
  error,
  children,
  ...rest
}: { title: string; error: unknown; children?: ReactNode } & Omit<
  ComponentProps<"div">,
  "title" | "children"
>) {
  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof ApiFailure ? error.hint : undefined;
  return (
    <Alert variant="destructive" {...rest}>
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {hint && <p>{hint}</p>}
        {children}
      </AlertDescription>
    </Alert>
  );
}
