import type { CliIssue } from './types';

export function issue(args: {
  code: string;
  message: string;
  field?: string | null;
  path?: string | null;
}): CliIssue {
  return {
    code: args.code,
    message: args.message,
    field: args.field ?? null,
    path: args.path ?? null,
  };
}

export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error) || 'Unknown error.';
}
