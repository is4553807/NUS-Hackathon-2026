import { throwValidationError } from "./errors.js";

export function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throwValidationError(`${field} must not be empty.`, { field });
  }

  return normalized;
}

export function requireNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throwValidationError(`${field} must be a non-negative number.`, {
      field,
      value,
    });
  }

  return value;
}

export function requireNonNegativeInteger(
  value: number,
  field: string,
): number {
  if (!Number.isInteger(value) || value < 0) {
    throwValidationError(`${field} must be a non-negative integer.`, {
      field,
      value,
    });
  }

  return value;
}

export function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throwValidationError(`${field} must be a positive integer.`, {
      field,
      value,
    });
  }

  return value;
}

export function requirePercentage(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throwValidationError(`${field} must be between 0 and 100.`, {
      field,
      value,
    });
  }

  return value;
}

export function requireDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throwValidationError(`${field} must be a valid timestamp.`, {
      field,
      value,
    });
  }

  return date;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
