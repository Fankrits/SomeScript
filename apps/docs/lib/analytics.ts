import { track } from '@vercel/analytics';

/**
 * Type-safe analytics tracker for SomeScript Docs application.
 */
export const docsAnalytics = {
  /**
   * Track custom event in documentation.
   */
  track(eventName: string, properties?: Record<string, string | number | boolean | null>) {
    try {
      track(eventName, properties);
    } catch (err) {
      console.warn('[Docs Analytics] Failed to track event:', eventName, err);
    }
  },

  /**
   * Track search query performed in documentation.
   */
  search(query: string, resultsCount?: number) {
    this.track('docs_search', {
      query,
      resultsCount: resultsCount ?? 0,
    });
  },

  /**
   * Track code snippet copy event.
   */
  copyCode(language?: string, snippetTitle?: string) {
    this.track('docs_copy_code', {
      language: language || 'unknown',
      snippetTitle: snippetTitle || '',
    });
  },

  /**
   * Track AI assistant (Docus Assistant) prompt in docs.
   */
  assistantQuery(prompt: string, skillUsed?: string) {
    this.track('docs_assistant_query', {
      promptLength: prompt.length,
      skillUsed: skillUsed || 'none',
    });
  },

  /**
   * Track documentation article helpfulness rating.
   */
  feedback(articlePath: string, isHelpful: boolean, comment?: string) {
    this.track('docs_feedback', {
      articlePath,
      isHelpful,
      comment: comment || '',
    });
  },
};
