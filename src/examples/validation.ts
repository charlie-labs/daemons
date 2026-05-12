import type { ValidationError } from './types';

export function formatFieldPath(path: readonly (string | number)[]): string | undefined {
  if (path.length === 0) {
    return undefined;
  }

  let formatted = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      formatted += `[${segment.toString()}]`;
      continue;
    }

    formatted += formatted.length === 0 ? segment : `.${segment}`;
  }

  return formatted;
}

export function withFieldPath(
  error: Omit<ValidationError, 'fieldPath'>,
  fieldPath: string | undefined
): ValidationError {
  return fieldPath ? { ...error, fieldPath } : error;
}

export function machineError(args: {
  code: string;
  path: string;
  fieldPath?: string | undefined;
  message: string;
}): ValidationError {
  return args.fieldPath
    ? {
        code: args.code,
        path: args.path,
        fieldPath: args.fieldPath,
        message: args.message,
      }
    : {
        code: args.code,
        path: args.path,
        message: args.message,
      };
}

export function normalizeThrownMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown error.';
}
