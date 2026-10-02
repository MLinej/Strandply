export type HttpErrorStatus = 400 | 401 | 403 | 404 | 409 | 422;

/** Thrown by services and guards. The app's onError turns it into `{ error: { code, message, details } }`. */
export class HttpError extends Error {
  constructor(
    readonly status: HttpErrorStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const unauthenticated = () => new HttpError(401, 'unauthenticated', 'Sign in required');

export const forbidden = (code = 'forbidden', message = 'You do not have permission to do this') =>
  new HttpError(403, code, message);

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);

export const conflict = (code: string, message: string) => new HttpError(409, code, message);

export const validationFailed = (message: string, details?: unknown) =>
  new HttpError(422, 'validation_failed', message, details);
