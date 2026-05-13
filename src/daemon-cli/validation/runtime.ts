import { parseDocument } from 'yaml';
import {
  canonicalFrontmatterKeys,
  catalogMetadataFrontmatterKeys,
  DAEMON_ID_PATTERN,
  legacyFrontmatterKeyToCanonicalField,
} from '../constants';
import { issue } from '../issues';
import type { CliIssue, RuntimeDaemon } from '../types';
import { validateCronExpression } from './cron';

type ParsedFrontmatterResult =
  | { ok: true; frontmatter: Record<string, unknown>; body: string; warnings: CliIssue[] }
  | { ok: false; errors: CliIssue[]; warnings: CliIssue[] };

export type RuntimeValidationResult =
  | { ok: true; daemon: RuntimeDaemon; warnings: CliIssue[]; errors: [] }
  | { ok: false; daemon: null; warnings: CliIssue[]; errors: CliIssue[] };

const FRONTMATTER_BLOCK_PATTERN = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const canonicalKeySet = new Set<string>(canonicalFrontmatterKeys);
const catalogMetadataKeySet = new Set<string>(catalogMetadataFrontmatterKeys);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeIssueMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

export function parseFrontmatterAndBody(args: {
  markdown: string;
  path?: string | undefined;
}): ParsedFrontmatterResult {
  const path = args.path ?? null;
  const normalizedMarkdown = args.markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = normalizedMarkdown.match(FRONTMATTER_BLOCK_PATTERN);

  if (!match) {
    return {
      ok: false,
      errors: [
        issue({
          code: 'FRONTMATTER_MISSING',
          message: 'Missing required YAML frontmatter block. Expected opening and closing --- delimiters at the top of the file.',
          path,
        }),
      ],
      warnings: [],
    };
  }

  const rawFrontmatter = match[1] ?? '';
  const body = normalizedMarkdown.slice(match[0].length);
  const document = parseDocument(rawFrontmatter, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });

  const warnings = document.warnings.map((warning) =>
    issue({
      code: 'FRONTMATTER_YAML_WARNING',
      message: normalizeIssueMessage(warning.message),
      path,
    })
  );

  if (document.errors.length > 0) {
    return {
      ok: false,
      errors: document.errors.map((error) =>
        issue({
          code: 'FRONTMATTER_YAML_INVALID',
          message: normalizeIssueMessage(error.message),
          path,
        })
      ),
      warnings,
    };
  }

  const parsedFrontmatter = document.toJS();
  if (!isRecord(parsedFrontmatter)) {
    return {
      ok: false,
      errors: [
        issue({
          code: 'FRONTMATTER_NOT_OBJECT',
          message: 'Frontmatter must be a YAML object with key-value pairs.',
          path,
        }),
      ],
      warnings,
    };
  }

  return { ok: true, frontmatter: parsedFrontmatter, body, warnings };
}

function pushIssue(args: {
  issues: CliIssue[];
  code: string;
  message: string;
  field?: string | null;
  path: string | null;
}): void {
  args.issues.push(issue(args));
}

function parseStringListField(args: {
  field: string;
  value: unknown;
  required: boolean;
  allowEmpty: boolean;
  issues: CliIssue[];
  path: string | null;
}): string[] | null {
  if (args.value === undefined) {
    if (args.required) {
      pushIssue({
        issues: args.issues,
        code: `FRONTMATTER_${args.field.toUpperCase()}_REQUIRED`,
        message: `Frontmatter field '${args.field}' is required.`,
        field: args.field,
        path: args.path,
      });
    }
    return args.required ? null : [];
  }

  if (!Array.isArray(args.value)) {
    pushIssue({
      issues: args.issues,
      code: `FRONTMATTER_${args.field.toUpperCase()}_INVALID_TYPE`,
      message: `Frontmatter field '${args.field}' must be a YAML list of strings.`,
      field: args.field,
      path: args.path,
    });
    return null;
  }

  const values: string[] = [];
  for (let index = 0; index < args.value.length; index += 1) {
    const entry = args.value[index];
    if (typeof entry !== 'string') {
      pushIssue({
        issues: args.issues,
        code: `FRONTMATTER_${args.field.toUpperCase()}_ENTRY_INVALID_TYPE`,
        message: `Frontmatter field '${args.field}' entry at index ${index} must be a string.`,
        field: `${args.field}[${index}]`,
        path: args.path,
      });
      continue;
    }

    const normalized = entry.trim();
    if (normalized.length === 0) {
      pushIssue({
        issues: args.issues,
        code: `FRONTMATTER_${args.field.toUpperCase()}_ENTRY_EMPTY`,
        message: `Frontmatter field '${args.field}' entry at index ${index} must not be empty.`,
        field: `${args.field}[${index}]`,
        path: args.path,
      });
      continue;
    }

    values.push(normalized);
  }

  if (!args.allowEmpty && values.length === 0) {
    pushIssue({
      issues: args.issues,
      code: `FRONTMATTER_${args.field.toUpperCase()}_EMPTY`,
      message: `Frontmatter field '${args.field}' must include at least one entry.`,
      field: args.field,
      path: args.path,
    });
    return null;
  }

  return values;
}

function legacyReplacementFor(key: string): string | null {
  if (key === 'name') return legacyFrontmatterKeyToCanonicalField.name;
  if (key === 'description') return legacyFrontmatterKeyToCanonicalField.description;
  if (key === 'triggers') return legacyFrontmatterKeyToCanonicalField.triggers;
  if (key === 'actions') return legacyFrontmatterKeyToCanonicalField.actions;
  if (key === 'disallowed') return legacyFrontmatterKeyToCanonicalField.disallowed;
  return null;
}

function validateSchema(args: {
  frontmatter: Record<string, unknown>;
  body: string;
  path: string | null;
}): RuntimeValidationResult {
  const errors: CliIssue[] = [];

  for (const key of Object.keys(args.frontmatter).sort()) {
    const legacyReplacement = legacyReplacementFor(key);
    if (legacyReplacement) {
      pushIssue({
        issues: errors,
        code: 'FRONTMATTER_LEGACY_KEY_NOT_ALLOWED',
        message: `Legacy frontmatter key '${key}' is not supported. Use '${legacyReplacement}' instead.`,
        field: key,
        path: args.path,
      });
      continue;
    }

    if (catalogMetadataKeySet.has(key)) {
      pushIssue({
        issues: errors,
        code: 'FRONTMATTER_CATALOG_METADATA_NOT_ALLOWED',
        message: `Catalog/example metadata key '${key}' is not valid runtime daemon frontmatter. Allowed keys: ${canonicalFrontmatterKeys.join(', ')}.`,
        field: key,
        path: args.path,
      });
      continue;
    }

    if (!canonicalKeySet.has(key)) {
      pushIssue({
        issues: errors,
        code: 'FRONTMATTER_UNKNOWN_KEY_NOT_ALLOWED',
        message: `Unknown frontmatter key '${key}'. Allowed keys: ${canonicalFrontmatterKeys.join(', ')}.`,
        field: key,
        path: args.path,
      });
    }
  }

  const rawId = args.frontmatter.id;
  let id: string | null = null;
  if (rawId === undefined) {
    pushIssue({ issues: errors, code: 'FRONTMATTER_ID_REQUIRED', message: "Frontmatter field 'id' is required.", field: 'id', path: args.path });
  } else if (typeof rawId !== 'string') {
    pushIssue({ issues: errors, code: 'FRONTMATTER_ID_INVALID_TYPE', message: "Frontmatter field 'id' must be a string.", field: 'id', path: args.path });
  } else {
    const normalizedId = rawId.trim();
    if (normalizedId.length === 0) {
      pushIssue({ issues: errors, code: 'FRONTMATTER_ID_EMPTY', message: "Frontmatter field 'id' must not be empty.", field: 'id', path: args.path });
    } else if (!DAEMON_ID_PATTERN.test(normalizedId)) {
      pushIssue({ issues: errors, code: 'FRONTMATTER_ID_INVALID_FORMAT', message: "Frontmatter field 'id' must match ^[a-z0-9]+(?:-[a-z0-9]+)*$.", field: 'id', path: args.path });
    } else {
      id = normalizedId;
    }
  }

  const rawPurpose = args.frontmatter.purpose;
  let purpose: string | null = null;
  if (rawPurpose === undefined) {
    pushIssue({ issues: errors, code: 'FRONTMATTER_PURPOSE_REQUIRED', message: "Frontmatter field 'purpose' is required.", field: 'purpose', path: args.path });
  } else if (typeof rawPurpose !== 'string') {
    pushIssue({ issues: errors, code: 'FRONTMATTER_PURPOSE_INVALID_TYPE', message: "Frontmatter field 'purpose' must be a string.", field: 'purpose', path: args.path });
  } else {
    const normalizedPurpose = rawPurpose.trim();
    if (normalizedPurpose.length === 0) {
      pushIssue({ issues: errors, code: 'FRONTMATTER_PURPOSE_EMPTY', message: "Frontmatter field 'purpose' must not be empty.", field: 'purpose', path: args.path });
    } else {
      purpose = normalizedPurpose;
    }
  }

  const watchIssuesBefore = errors.length;
  const watch = parseStringListField({
    field: 'watch',
    value: args.frontmatter.watch,
    required: false,
    allowEmpty: true,
    issues: errors,
    path: args.path,
  });
  const watchHasValidationIssues = errors.length > watchIssuesBefore;

  const routines = parseStringListField({
    field: 'routines',
    value: args.frontmatter.routines,
    required: true,
    allowEmpty: false,
    issues: errors,
    path: args.path,
  });

  const deny = parseStringListField({
    field: 'deny',
    value: args.frontmatter.deny,
    required: false,
    allowEmpty: true,
    issues: errors,
    path: args.path,
  });

  const scheduleIssuesBefore = errors.length;
  const rawSchedule = args.frontmatter.schedule;
  let schedule: string | null = null;
  if (rawSchedule !== undefined) {
    if (typeof rawSchedule !== 'string') {
      pushIssue({
        issues: errors,
        code: 'FRONTMATTER_SCHEDULE_INVALID_TYPE',
        message: "Frontmatter field 'schedule' must be a cron string when present.",
        field: 'schedule',
        path: args.path,
      });
    } else {
      const normalizedSchedule = rawSchedule.trim();
      if (normalizedSchedule.length > 0) {
        const cronValidation = validateCronExpression({ cronExpression: normalizedSchedule });
        if (!cronValidation.ok) {
          pushIssue({
            issues: errors,
            code: 'FRONTMATTER_SCHEDULE_INVALID_CRON',
            message: `Frontmatter field 'schedule' is not a valid five-field cron expression (${cronValidation.reason}).`,
            field: 'schedule',
            path: args.path,
          });
        } else {
          schedule = cronValidation.normalizedCronExpression;
        }
      }
    }
  }
  const scheduleHasValidationIssues = errors.length > scheduleIssuesBefore;

  const hasActivation = (watch?.length ?? 0) > 0 || schedule !== null;
  if (!hasActivation && !watchHasValidationIssues && !scheduleHasValidationIssues) {
    pushIssue({
      issues: errors,
      code: 'FRONTMATTER_ACTIVATION_REQUIRED',
      message: "At least one activation field is required: provide non-empty 'watch' entries or a valid 'schedule'.",
      field: 'watch',
      path: args.path,
    });
  }

  const body = args.body.trim();
  if (body.length === 0) {
    pushIssue({
      issues: errors,
      code: 'DAEMON_BODY_MISSING',
      message: 'Markdown body is required below the frontmatter. Add guidance content in the body section.',
      path: args.path,
    });
  }

  if (errors.length > 0) {
    return { ok: false, daemon: null, warnings: [], errors };
  }

  if (!id || !purpose || !routines || !watch || !deny) {
    return {
      ok: false,
      daemon: null,
      warnings: [],
      errors: [
        issue({
          code: 'INTERNAL_VALIDATION_STATE_ERROR',
          message: 'Validator reached an unreachable state while normalizing fields.',
          path: args.path,
        }),
      ],
    };
  }

  return {
    ok: true,
    daemon: {
      id,
      purpose,
      watch,
      routines,
      deny,
      schedule,
      bodyLength: body.length,
    },
    warnings: [],
    errors: [],
  };
}

export function validateRuntimeDaemonMarkdown(args: {
  content: string;
  path?: string;
  expectedId?: string | null;
}): RuntimeValidationResult {
  const path = args.path ?? null;
  const parsed = parseFrontmatterAndBody({ markdown: args.content, path: path ?? undefined });
  if (!parsed.ok) {
    return { ok: false, daemon: null, warnings: parsed.warnings, errors: parsed.errors };
  }

  const validated = validateSchema({ frontmatter: parsed.frontmatter, body: parsed.body, path });
  const warnings = [...parsed.warnings, ...validated.warnings];
  if (!validated.ok) {
    return { ok: false, daemon: null, warnings, errors: validated.errors };
  }

  if (args.expectedId && validated.daemon.id !== args.expectedId) {
    return {
      ok: false,
      daemon: null,
      warnings,
      errors: [
        issue({
          code: 'DAEMON_ID_PATH_MISMATCH',
          message: `DAEMON.md id '${validated.daemon.id}' must match directory slug '${args.expectedId}'.`,
          field: 'id',
          path,
        }),
      ],
    };
  }

  return { ok: true, daemon: validated.daemon, warnings, errors: [] };
}
