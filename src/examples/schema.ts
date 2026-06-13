import { parseDocument } from 'yaml';
import { z, type ZodIssue } from 'zod';
import { validateCronExpression } from '../daemon-cli/validation/cron';
import { findPublicSafetyErrors } from './public-safety';
import { isKebabCaseSlug, isSupportPath } from './paths';
import type {
  CatalogExample,
  DaemonFrontmatter,
  ExampleAdaptation,
  ExampleMetadata,
  ExamplesCatalog,
  ValidationError,
  ValidationResult,
} from './types';
import { formatFieldPath, machineError } from './validation';

const STALE_METADATA_FIELDS = new Set([
  'readiness',
  'showOnWebsite',
  'showInDashboard',
  'bestFor',
  'requirements',
  'riskTier',
  'activationMode',
  'display',
  'metadata',
]);

const slugSchema = z.string().min(1).refine(isKebabCaseSlug, {
  message: 'Expected a stable kebab-case slug.',
});

const nonEmptyStringSchema = z.string().trim().min(1);
const stringListSchema = z.array(nonEmptyStringSchema);
const ADAPTATION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const adaptationKeySchema = z.string().regex(ADAPTATION_KEY_PATTERN, {
  message: 'Expected a token-safe adaptation key matching ^[a-z][a-z0-9_]*$.',
});

const exampleAdaptationSchema: z.ZodType<ExampleAdaptation> = z
  .object({
    key: adaptationKeySchema,
    label: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    required: z.boolean(),
    default: z.string().optional(),
    suggestions: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.required && value.default !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['default'],
        message: 'Required adaptations must not declare a default value.',
      });
    }

    if (!value.required && value.default === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['default'],
        message: 'Optional adaptations must declare a default value.',
      });
    }
  });

const adaptationsSchema = z
  .array(exampleAdaptationSchema)
  .default([])
  .superRefine((value, context) => {
    const seen = new Map<string, number>();
    for (const [index, adaptation] of value.entries()) {
      const firstIndex = seen.get(adaptation.key);
      if (firstIndex !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'key'],
          message: `Duplicate adaptation key '${adaptation.key}' also appears at adaptations[${firstIndex.toString()}].`,
        });
      } else {
        seen.set(adaptation.key, index);
      }
    }
  });

const jobToBeDoneSchema = z.enum([
  'maintain-and-modernize',
  'organize',
  'document',
  'review-with-confidence',
  'build-production-grade-typescript',
  'operate',
  'explain',
  'plan',
  'daemon-operations',
]);

const integrationSchema = z.enum(['github', 'linear', 'slack', 'sentry']);

const exampleMetadataSchema = z
  .object({
    id: slugSchema,
    title: nonEmptyStringSchema,
    status: z.enum(['draft', 'ready', 'deprecated']),
    summary: nonEmptyStringSchema,
    readiness: z.enum(['direct-copy', 'adapt-before-use']),
    showOnWebsite: z.boolean(),
    showInDashboard: z.boolean(),
    fit: z
      .object({
        jobsToBeDone: z.array(jobToBeDoneSchema).min(1),
        bestFor: z.array(nonEmptyStringSchema).min(1),
        notFor: z.array(nonEmptyStringSchema).min(1),
      })
      .strict(),
    requirements: z
      .object({
        requiredIntegrations: z.array(integrationSchema),
        optionalIntegrations: z.array(integrationSchema),
        other: stringListSchema,
      })
      .strict(),
    adaptation: z
      .object({
        mustCustomize: stringListSchema,
      })
      .strict(),
    adaptations: adaptationsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.readiness === 'adapt-before-use' && value.adaptation.mustCustomize.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adaptation', 'mustCustomize'],
        message: 'adapt-before-use examples must name at least one local customization.',
      });
    }

    if (value.readiness === 'direct-copy' && value.adaptation.mustCustomize.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adaptation', 'mustCustomize'],
        message: 'direct-copy examples must not require local customization.',
      });
    }
  });

const fiveFieldCronSchema = z.string().superRefine((value, context) => {
  const result = validateCronExpression({ cronExpression: value });
  if (!result.ok) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Expected a standard five-field UTC cron expression (${result.reason}).`,
    });
  }
});

const daemonFrontmatterSchema = z
  .object({
    id: slugSchema,
    purpose: nonEmptyStringSchema,
    watch: z.array(nonEmptyStringSchema).min(1).optional(),
    routines: z.array(nonEmptyStringSchema).min(1),
    deny: z.array(nonEmptyStringSchema).min(1).optional(),
    schedule: fiveFieldCronSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.watch && !value.schedule) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['watch'],
        message: 'DAEMON.md must define at least one activation path through watch or schedule.',
      });
    }
  });

const catalogExampleSchema = z
  .object({
    id: slugSchema,
    title: nonEmptyStringSchema,
    status: z.enum(['draft', 'ready', 'deprecated']),
    summary: nonEmptyStringSchema,
    readiness: z.enum(['direct-copy', 'adapt-before-use']),
    showOnWebsite: z.boolean(),
    showInDashboard: z.boolean(),
    fit: z
      .object({
        jobsToBeDone: z.array(jobToBeDoneSchema).min(1),
        bestFor: z.array(nonEmptyStringSchema).min(1),
        notFor: z.array(nonEmptyStringSchema).min(1),
      })
      .strict(),
    requirements: z
      .object({
        requiredIntegrations: z.array(integrationSchema),
        optionalIntegrations: z.array(integrationSchema),
        other: stringListSchema,
      })
      .strict(),
    adaptation: z
      .object({
        mustCustomize: stringListSchema,
      })
      .strict(),
    adaptations: adaptationsSchema,
    daemon: z
      .object({
        path: z.literal('DAEMON.md'),
        content: nonEmptyStringSchema,
      })
      .strict(),
    scripts: z.array(
      z.string().refine((value) => isSupportPath(value, 'scripts'), {
        message: 'Expected a daemon-package-relative scripts/ support path.',
      })
    ),
    references: z.array(
      z.string().refine((value) => isSupportPath(value, 'references'), {
        message: 'Expected a daemon-package-relative references/ support path.',
      })
    ),
    source: z
      .object({
        directory: nonEmptyStringSchema,
        url: nonEmptyStringSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.readiness === 'adapt-before-use' && value.adaptation.mustCustomize.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adaptation', 'mustCustomize'],
        message: 'adapt-before-use examples must name at least one local customization.',
      });
    }

    if (value.readiness === 'direct-copy' && value.adaptation.mustCustomize.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adaptation', 'mustCustomize'],
        message: 'direct-copy examples must not require local customization.',
      });
    }

    const expectedSourceDirectory = `daemons/${value.id}`;
    if (value.source.directory !== expectedSourceDirectory) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'directory'],
        message: `source.directory must match ${expectedSourceDirectory}.`,
      });
    }
  });

const examplesCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z
      .object({
        repository: z.literal('charlie-labs/daemons'),
        baseDirectory: z.literal('daemons'),
      })
      .strict(),
    examples: z.array(catalogExampleSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, example] of value.examples.entries()) {
      if (seen.has(example.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['examples', index, 'id'],
          message: `Duplicate example id ${example.id}.`,
        });
      }
      seen.add(example.id);
    }
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseExamplesCatalogContent(args: {
  content: string;
  path: string;
}): ValidationResult<ExamplesCatalog> {
  let value: unknown;
  try {
    value = JSON.parse(args.content);
  } catch (error) {
    return {
      ok: false,
      errors: [
        machineError({
          code: 'invalid_catalog_json',
          path: args.path,
          message: error instanceof Error ? error.message : 'examples.json is not valid JSON.',
        }),
      ],
    };
  }

  return parseExamplesCatalogValue({ value, path: args.path });
}

export function parseExamplesCatalogValue(args: {
  value: unknown;
  path: string;
}): ValidationResult<ExamplesCatalog> {
  if (!isRecord(args.value) || args.value.schemaVersion !== 1) {
    const actual = isRecord(args.value) ? String(args.value.schemaVersion) : typeof args.value;
    return {
      ok: false,
      errors: [
        machineError({
          code: 'unsupported_catalog_schema_version',
          path: args.path,
          fieldPath: 'schemaVersion',
          message: `Unsupported examples.json schemaVersion ${actual}; supported schemaVersion is 1.`,
        }),
      ],
    };
  }

  const parsed = examplesCatalogSchema.safeParse(args.value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: zodIssuesToValidationErrors(parsed.error.issues, args.path),
    };
  }

  return { ok: true, value: parsed.data, errors: [] };
}

export function parseExampleYaml(args: {
  content: string;
  path: string;
}): ValidationResult<ExampleMetadata> {
  const yamlResult = parseYamlContent(args.content, args.path, 'invalid_example_yml');
  const publicSafetyErrors = findPublicSafetyErrors({ content: args.content, path: args.path });
  if (!yamlResult.ok) {
    return { ok: false, errors: [...yamlResult.errors, ...publicSafetyErrors] };
  }

  const parsed = exampleMetadataSchema.safeParse(yamlResult.value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [...zodIssuesToValidationErrors(parsed.error.issues, args.path), ...publicSafetyErrors],
    };
  }

  if (publicSafetyErrors.length > 0) {
    return { ok: false, errors: publicSafetyErrors };
  }

  return { ok: true, value: parsed.data, errors: [] };
}

export function parseDaemonMarkdown(args: {
  content: string;
  path: string;
}): ValidationResult<{ frontmatter: DaemonFrontmatter; body: string }> {
  const publicSafetyErrors = findPublicSafetyErrors({ content: args.content, path: args.path });
  const frontmatter = splitFrontmatter(args.content, args.path);
  if (!frontmatter.ok) {
    return { ok: false, errors: [...frontmatter.errors, ...publicSafetyErrors] };
  }

  const yamlResult = parseYamlContent(frontmatter.value.yaml, args.path, 'invalid_daemon_md');
  if (!yamlResult.ok) {
    return { ok: false, errors: [...yamlResult.errors, ...publicSafetyErrors] };
  }

  const parsed = daemonFrontmatterSchema.safeParse(yamlResult.value);
  const errors = parsed.success ? [] : zodIssuesToValidationErrors(parsed.error.issues, args.path);

  if (frontmatter.value.body.trim().length === 0) {
    errors.push(
      machineError({
        code: 'invalid_daemon_md',
        path: args.path,
        message: 'DAEMON.md body must contain runtime guidance.',
      })
    );
  }

  errors.push(...publicSafetyErrors);

  if (!parsed.success || errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { frontmatter: parsed.data, body: frontmatter.value.body },
    errors: [],
  };
}

function parseYamlContent(
  content: string,
  path: string,
  invalidCode: 'invalid_example_yml' | 'invalid_daemon_md'
): ValidationResult<unknown> {
  const document = parseDocument(content, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });

  const parseErrors = [...document.errors, ...document.warnings];
  if (parseErrors.length > 0) {
    return {
      ok: false,
      errors: parseErrors.map((error) =>
        machineError({
          code: invalidCode,
          path,
          message: error.message,
        })
      ),
    };
  }

  return { ok: true, value: document.toJSON(), errors: [] };
}

function splitFrontmatter(
  content: string,
  path: string
): ValidationResult<{ yaml: string; body: string }> {
  const normalizedContent = content.replace(/^\uFEFF/, '');
  const lines = normalizedContent.split(/\r?\n/);
  if (lines[0] !== '---') {
    return {
      ok: false,
      errors: [
        machineError({
          code: 'invalid_daemon_md',
          path,
          message: 'DAEMON.md must start with YAML frontmatter delimited by --- lines.',
        }),
      ],
    };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');
  if (closingIndex < 0) {
    return {
      ok: false,
      errors: [
        machineError({
          code: 'invalid_daemon_md',
          path,
          message: 'DAEMON.md frontmatter must end with a closing --- delimiter.',
        }),
      ],
    };
  }

  return {
    ok: true,
    value: {
      yaml: lines.slice(1, closingIndex).join('\n'),
      body: lines.slice(closingIndex + 1).join('\n'),
    },
    errors: [],
  };
}

function zodIssuesToValidationErrors(issues: readonly ZodIssue[], path: string): ValidationError[] {
  return issues.map((issue) => {
    if (issue.code === z.ZodIssueCode.unrecognized_keys) {
      const firstKey = issue.keys[0];
      const fieldPath = firstKey
        ? formatFieldPath([...issue.path, firstKey])
        : formatFieldPath(issue.path);
      const isStale = firstKey ? STALE_METADATA_FIELDS.has(firstKey) : false;

      return machineError({
        code: isStale ? 'stale_metadata_field' : 'unknown_key',
        path,
        fieldPath,
        message: isStale
          ? `Stale PR #10023 metadata field is not allowed: ${firstKey}.`
          : issue.message,
      });
    }

    const code = zodIssueCode(issue);
    return machineError({
      code,
      path,
      fieldPath: formatFieldPath(issue.path),
      message: issue.message,
    });
  });
}

function zodIssueCode(issue: ZodIssue): string {
  if (issue.code === z.ZodIssueCode.invalid_enum_value) {
    return 'invalid_enum_value';
  }

  if (issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined') {
    return 'missing_required_field';
  }

  if (issue.code === z.ZodIssueCode.custom) {
    return 'invalid_field_value';
  }

  return 'invalid_schema';
}
