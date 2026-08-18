import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** FormData.get() is `string | File | null` — narrows a text field without an unsafe cast. */
export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** FormData.get() is `string | File | null` — narrows a file field without an unsafe cast. */
export function formFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File ? value : null;
}

/** Whole days left before a trashed project is purged (see TRASH_RETENTION_DAYS). */
export function daysLeft(deletedAt: Date, retentionDays: number, now: number = Date.now()): number {
  const expires = deletedAt.getTime() + retentionDays * 86_400_000;
  return Math.max(0, Math.ceil((expires - now) / 86_400_000));
}
