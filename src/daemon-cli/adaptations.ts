import { issue } from './issues';
import type { CliIssue } from './types';
import type { CatalogExample, ExampleAdaptation } from '../examples/types';

export const ADAPTATION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const MUSTACHE_TOKEN_PATTERN = /{{\s*([^{}]*?)\s*}}/g;
const ADAPTATION_EXPRESSION_PREFIX_PATTERN = /^adapt(?:$|[.\s])/;
const ADAPTATION_TOKEN_EXPRESSION_PATTERN = /^adapt\.([a-z][a-z0-9_]*)$/;
const ADAPTATION_TOKEN_PATTERN = /{{\s*adapt\.([a-z][a-z0-9_]*)\s*}}/g;
const UNRESOLVED_ADAPTATION_TOKEN_PATTERN = /{{\s*adapt\.[^}]*}}/;

export type AdaptationValues = Map<string, string>;

export type AdaptationResolution = {
  values: AdaptationValues;
  appliedKeys: string[];
};

function sortedKeys(keys: Iterable<string>): string[] {
  return [...keys].sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateInputKey(args: { key: string; field: string; path?: string | null | undefined; errors: CliIssue[] }): void {
  if (!ADAPTATION_KEY_PATTERN.test(args.key)) {
    args.errors.push(
      issue({
        code: 'ADAPTATION_KEY_INVALID',
        message: `Adaptation key '${args.key}' must match ^[a-z][a-z0-9_]*$.`,
        field: args.field,
        path: args.path ?? null,
      })
    );
  }
}

export function parseAdaptFlags(flagValues: readonly string[] | undefined):
  | { ok: true; values: AdaptationValues }
  | { ok: false; errors: CliIssue[] } {
  const values: AdaptationValues = new Map();
  const errors: CliIssue[] = [];

  for (const [index, rawValue] of (flagValues ?? []).entries()) {
    const field = `adapt[${index.toString()}]`;
    const separatorIndex = rawValue.indexOf('=');
    if (separatorIndex <= 0) {
      errors.push(
        issue({
          code: 'ADAPT_FLAG_INVALID',
          message: 'Adaptation flags must use --adapt key=value syntax.',
          field,
        })
      );
      continue;
    }

    const key = rawValue.slice(0, separatorIndex);
    const value = rawValue.slice(separatorIndex + 1);
    validateInputKey({ key, field, errors });
    values.set(key, value);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, values };
}

export function parseAdaptFileContent(args: { content: string; path: string }):
  | { ok: true; values: AdaptationValues }
  | { ok: false; errors: CliIssue[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.content);
  } catch (error) {
    return {
      ok: false,
      errors: [
        issue({
          code: 'ADAPT_FILE_JSON_INVALID',
          message: error instanceof Error ? error.message : 'Adaptation file must contain valid JSON.',
          path: args.path,
        }),
      ],
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      errors: [
        issue({
          code: 'ADAPT_FILE_INVALID_TYPE',
          message: 'Adaptation file must contain a JSON object of string values.',
          path: args.path,
        }),
      ],
    };
  }

  const values: AdaptationValues = new Map();
  const errors: CliIssue[] = [];
  for (const key of Object.keys(parsed).sort((left, right) => left.localeCompare(right))) {
    validateInputKey({ key, field: key, path: args.path, errors });
    const value = parsed[key];
    if (typeof value !== 'string') {
      errors.push(
        issue({
          code: 'ADAPT_FILE_VALUE_INVALID_TYPE',
          message: `Adaptation file value for '${key}' must be a string, not ${valueType(value)}.`,
          field: key,
          path: args.path,
        })
      );
      continue;
    }
    values.set(key, value);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, values };
}

function metadataByKey(adaptations: readonly ExampleAdaptation[]):
  | { ok: true; byKey: Map<string, ExampleAdaptation> }
  | { ok: false; errors: CliIssue[] } {
  const byKey = new Map<string, ExampleAdaptation>();
  const errors: CliIssue[] = [];

  for (const [index, adaptation] of adaptations.entries()) {
    if (byKey.has(adaptation.key)) {
      errors.push(
        issue({
          code: 'CATALOG_ADAPTATION_DUPLICATE_KEY',
          message: `Catalog adaptation key '${adaptation.key}' is duplicated.`,
          field: `adaptations[${index.toString()}].key`,
        })
      );
      continue;
    }
    byKey.set(adaptation.key, adaptation);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, byKey };
}

function validateUnknownInputKeys(args: {
  values: AdaptationValues;
  knownKeys: ReadonlySet<string>;
  source: 'file' | 'flag';
  path?: string | null | undefined;
}): CliIssue[] {
  const errors: CliIssue[] = [];
  for (const key of sortedKeys(args.values.keys())) {
    if (!args.knownKeys.has(key)) {
      errors.push(
        issue({
          code: 'UNKNOWN_ADAPTATION_INPUT_KEY',
          message: `Unknown adaptation input key '${key}'.`,
          field: key,
          path: args.path ?? null,
        })
      );
    }
  }
  return errors;
}

export function resolveAdaptations(args: {
  entry: CatalogExample;
  fileValues: AdaptationValues;
  cliValues: AdaptationValues;
  filePath?: string | null | undefined;
}): { ok: true; resolution: AdaptationResolution } | { ok: false; errors: CliIssue[] } {
  const metadataResult = metadataByKey(args.entry.adaptations ?? []);
  if (!metadataResult.ok) {
    return metadataResult;
  }

  const byKey = metadataResult.byKey;
  const knownKeys = new Set(byKey.keys());
  const errors: CliIssue[] = [
    ...validateUnknownInputKeys({ values: args.fileValues, knownKeys, source: 'file', path: args.filePath }),
    ...validateUnknownInputKeys({ values: args.cliValues, knownKeys, source: 'flag' }),
  ];

  const values: AdaptationValues = new Map();
  for (const key of sortedKeys(byKey.keys())) {
    const adaptation = byKey.get(key)!;
    if (adaptation.required) {
      if (adaptation.default !== undefined) {
        errors.push(
          issue({
            code: 'CATALOG_REQUIRED_ADAPTATION_HAS_DEFAULT',
            message: `Catalog required adaptation '${key}' must not declare a default.`,
            field: key,
          })
        );
      }
      continue;
    }

    if (adaptation.default === undefined) {
      errors.push(
        issue({
          code: 'CATALOG_OPTIONAL_ADAPTATION_MISSING_DEFAULT',
          message: `Catalog optional adaptation '${key}' must declare a default.`,
          field: key,
        })
      );
      continue;
    }

    values.set(key, adaptation.default);
  }

  for (const key of sortedKeys(args.fileValues.keys())) {
    const value = args.fileValues.get(key)!;
    if (knownKeys.has(key)) values.set(key, value);
  }

  for (const [key, value] of args.cliValues.entries()) {
    if (knownKeys.has(key)) values.set(key, value);
  }

  for (const key of sortedKeys(byKey.keys())) {
    const adaptation = byKey.get(key)!;
    if (adaptation.required && !values.has(key)) {
      errors.push(
        issue({
          code: 'MISSING_REQUIRED_ADAPTATION',
          message: `Missing required adaptation '${key}'. Provide it with --adapt ${key}=... or --adapt-file.`,
          field: key,
        })
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    resolution: {
      values,
      appliedKeys: sortedKeys(values.keys()),
    },
  };
}

export function renderAdaptationTokens(args: {
  content: string;
  values: AdaptationValues;
  knownKeys: ReadonlySet<string>;
  path: string;
}): { ok: true; content: string } | { ok: false; errors: CliIssue[] } {
  const errors: CliIssue[] = [];
  const reportedMalformedTokens = new Set<string>();

  for (const token of args.content.matchAll(MUSTACHE_TOKEN_PATTERN)) {
    const rawExpression = token[1] ?? '';
    const expression = rawExpression.trim();
    if (!ADAPTATION_EXPRESSION_PREFIX_PATTERN.test(expression)) {
      continue;
    }

    const expressionMatch = ADAPTATION_TOKEN_EXPRESSION_PATTERN.exec(expression);
    if (!expressionMatch) {
      const renderedToken = token[0] ?? `{{${rawExpression}}}`;
      if (reportedMalformedTokens.has(renderedToken)) {
        continue;
      }

      reportedMalformedTokens.add(renderedToken);
      errors.push(
        issue({
          code: 'MALFORMED_ADAPTATION_TOKEN',
          message: `Malformed adaptation token '${renderedToken}'. Use '{{adapt.key}}' with a key matching ^[a-z][a-z0-9_]*$.`,
          path: args.path,
        })
      );
      continue;
    }

    const key = expressionMatch[1] ?? '';
    if (!args.knownKeys.has(key)) {
      errors.push(
        issue({
          code: 'UNKNOWN_ADAPTATION_TOKEN',
          message: `Unknown adaptation token '${key}'.`,
          field: key,
          path: args.path,
        })
      );
      continue;
    }

    if (!args.values.has(key)) {
      errors.push(
        issue({
          code: 'MISSING_ADAPTATION_TOKEN_VALUE',
          message: `No value was provided for adaptation token '${key}'.`,
          field: key,
          path: args.path,
        })
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const rendered = args.content.replace(ADAPTATION_TOKEN_PATTERN, (_match, rawKey: string) => args.values.get(rawKey) ?? '');
  if (UNRESOLVED_ADAPTATION_TOKEN_PATTERN.test(rendered)) {
    return {
      ok: false,
      errors: [
        issue({
          code: 'UNRESOLVED_ADAPTATION_TOKEN',
          message: 'Rendered content still contains an adaptation token.',
          path: args.path,
        }),
      ],
    };
  }

  return { ok: true, content: rendered };
}

export function knownAdaptationKeys(entry: CatalogExample): ReadonlySet<string> {
  return new Set((entry.adaptations ?? []).map((adaptation) => adaptation.key));
}
