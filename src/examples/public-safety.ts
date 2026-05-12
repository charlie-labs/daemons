import type { ValidationError } from './types';
import { machineError } from './validation';

type SafetyPattern = {
  pattern: RegExp;
  message: string;
};

const SAFETY_PATTERNS: readonly SafetyPattern[] = [
  {
    pattern: /https?:\/\/linear\.app\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/i,
    message: 'Private Linear URLs are not public-safe example content.',
  },
  {
    pattern: /https?:\/\/[A-Za-z0-9.-]+\.slack\.com\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/i,
    message: 'Private Slack URLs are not public-safe example content.',
  },
  {
    pattern:
      /(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{20,}|ghs_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/,
    message: 'Credential-looking token values are not public-safe example content.',
  },
  {
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    message: 'Private key material is not public-safe example content.',
  },
  {
    pattern:
      /(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password)\s*[:=]\s*["']?(?!<|\$\{|REPLACE_|YOUR_|example|placeholder)[A-Za-z0-9_./+=-]{12,}/i,
    message: 'Credential-looking assignments are not public-safe example content.',
  },
  {
    pattern: /(?:^|[\s"'`(])(?:\/home\/[A-Za-z0-9._-]+|\/Users\/[A-Za-z0-9._-]+)\//,
    message: 'Machine-local paths are not public-safe example content.',
  },
  {
    pattern: /https?:\/\/[A-Za-z0-9.-]*(?:internal|corp|staging)\.[A-Za-z0-9.-]+[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*/i,
    message: 'Private hostnames are not public-safe example content.',
  },
];

export function findPublicSafetyErrors(args: {
  content: string;
  path: string;
  fieldPath?: string | undefined;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const safetyPattern of SAFETY_PATTERNS) {
    if (!safetyPattern.pattern.test(args.content)) {
      continue;
    }

    errors.push(
      machineError({
        code: 'public_safety',
        path: args.path,
        fieldPath: args.fieldPath,
        message: safetyPattern.message,
      })
    );
  }

  return errors;
}
