import { track } from "@vercel/analytics";

/**
 * Type-safe analytics tracker for SomeScript Web application.
 */
export const analytics = {
  /**
   * Track a generic custom event.
   */
  track(eventName: string, properties?: Record<string, string | number | boolean | null>) {
    try {
      track(eventName, properties);
    } catch (err) {
      console.warn("[Analytics] Failed to log event:", eventName, err);
    }
  },

  /**
   * Track user navigation / page view.
   */
  pageView(pageName: string, path?: string) {
    this.track("page_view", {
      page: pageName,
      path: path || typeof window !== "undefined" ? window.location.pathname : "",
    });
  },

  /**
   * Track user actions (e.g., CTA click, export document, toggle theme).
   */
  userAction(action: string, category: string, metadata?: Record<string, string | number | boolean>) {
    this.track("user_action", {
      action,
      category,
      ...metadata,
    });
  },

  /**
   * Track document compilation or export events.
   */
  documentExport(format: "pdf" | "tex" | "zip", documentId?: string) {
    this.track("document_export", {
      format,
      documentId: documentId || "unknown",
    });
  },

  /**
   * Track AI assistant (Eve) interaction events.
   */
  aiPrompt(action: "generate" | "explain" | "fix_error" | "chat", promptType?: string) {
    this.track("ai_interaction", {
      action,
      promptType: promptType || "general",
    });
  },

  /**
   * Track error occurrences for operational metrics.
   */
  error(errorName: string, message: string, componentStack?: string) {
    this.track("app_error", {
      errorName,
      message,
      componentStack: componentStack || "",
    });
  },
};
