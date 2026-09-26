/**
 * Application errors carry a customer-safe message. Anything that is not an
 * AppError is treated as internal: logged server-side, never shown to the user.
 */
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT"
  | "UNAVAILABLE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYMENT: 402,
  UNAVAILABLE: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const notFound = (what = "That page") => new AppError("NOT_FOUND", `${what} could not be found.`);
export const forbidden = () => new AppError("FORBIDDEN", "You don't have permission to do that.");
export const unauthorized = () => new AppError("UNAUTHORIZED", "Please sign in to continue.");
