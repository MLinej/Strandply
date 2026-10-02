import { isApiError } from '@/api/client';

/** One-line message for a failed API call, using the server's message when it has one. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (isApiError(err)) {
    if (err.code === 'validation_failed' && Array.isArray(err.details) && err.details.length) {
      const first = err.details[0] as { message?: string };
      return first.message ?? err.message;
    }
    return err.message || fallback;
  }
  return fallback;
}

/** Field errors from a 422, keyed by path ("partyId", "items.0.productName"). */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!isApiError(err, 'validation_failed') || !Array.isArray(err.details)) return {};
  return Object.fromEntries((err.details as { path: string; message: string }[]).map((d) => [d.path, d.message]));
}
