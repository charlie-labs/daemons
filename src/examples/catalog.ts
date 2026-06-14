import { constants } from 'node:fs';
import { access, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { findPublicSafetyErrors } from './public-safety';
import { isKebabCaseSlug, isSupportPath, toPosixPath } from './paths';
import { parseDaemonMarkdown, parseExampleYaml } from './schema';
import type {
  CatalogExample,
  DaemonPackage,
  ExampleAdaptation,
  ExampleMetadata,
  ExamplesCatalog,
  ValidationError,
  ValidationResult,
} from './types';
import { machineError, normalizeThrownMessage } from './validation';

const SOURCE_REPOSITORY = 'charlie-labs/daemons';
const SOURCE_BASE_DIRECTORY = 'daemons';
const DEFAULT_PUBLICATION_REF = 'master';
const ROOT_CATALOG_PATH = 'examples.json';
const ALLOWED_DAEMON_PACKAGE_ENTRIES = new Set(['DAEMON.md', 'example.yml', 'scripts', 'references']);
const MUSTACHE_TOKEN_PATTERN = /{{\s*([^{}]*?)\s*}}/g;
const ADAPTATION_EXPRESSION_PREFIX_PATTERN = /^adapt(?:$|[.\s])/;
const ADAPTATION_TOKEN_EXPRESSION_PATTERN = /^adapt\.([a-z][a-z0-9_]*)$/;

export async function generateCatalogFromRepository(
  repoRoot: string,
  options: { publicationRef?: string } = {}
): Promise<ValidationResult<ExamplesCatalog>> {
  const packagesResult = await discoverDaemonPackages(repoRoot);
  if (!packagesResult.ok) {
    return packagesResult;
  }

  const packageResults = await Promise.all(
    packagesResult.value.map((daemonPackage) => loadCatalogExample(repoRoot, daemonPackage, options))
  );

  const errors = packageResults.flatMap((result) => result.errors);
  errors.push(...findDuplicateIdErrors(packageResults));

  if (errors.length > 0) {
    return { ok: false, errors: sortValidationErrors(errors) };
  }

  const examples = packageResults
    .flatMap((result) => (result.entry ? [result.entry] : []))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    ok: true,
    value: {
      schemaVersion: 2,
      source: {
        repository: SOURCE_REPOSITORY,
        baseDirectory: SOURCE_BASE_DIRECTORY,
      },
      examples,
    },
    errors: [],
  };
}

export async function writeGeneratedCatalog(repoRoot: string): Promise<ValidationResult<ExamplesCatalog>> {
  const result = await generateCatalogFromRepository(repoRoot);
  if (!result.ok) {
    return result;
  }

  await writeFile(join(repoRoot, ROOT_CATALOG_PATH), serializeCatalog(result.value), 'utf8');
  return result;
}

export async function validateCatalogFile(repoRoot: string): Promise<ValidationResult<ExamplesCatalog>> {
  const generated = await generateCatalogFromRepository(repoRoot);
  if (!generated.ok) {
    return generated;
  }

  const catalogPath = join(repoRoot, ROOT_CATALOG_PATH);
  let current: string;
  try {
    current = await readFile(catalogPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      errors: [
        machineError({
          code: 'missing_catalog',
          path: ROOT_CATALOG_PATH,
          message: `Unable to read examples.json: ${normalizeThrownMessage(error)}`,
        }),
      ],
    };
  }

  const expected = serializeCatalog(generated.value);
  if (current !== expected) {
    return {
      ok: false,
      errors: [
        machineError({
          code: 'catalog_drift',
          path: ROOT_CATALOG_PATH,
          message: 'examples.json does not match generated output. Run bun run generate:examples.',
        }),
      ],
    };
  }

  return generated;
}

export function serializeCatalog(catalog: ExamplesCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}


function catalogAdaptations(adaptations: readonly ExampleAdaptation[]): ExampleAdaptation[] {
  return [...adaptations]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((adaptation) => ({
      key: adaptation.key,
      label: adaptation.label,
      description: adaptation.description,
      required: adaptation.required,
      ...(adaptation.default !== undefined ? { default: adaptation.default } : {}),
      ...(adaptation.suggestions !== undefined ? { suggestions: [...adaptation.suggestions] } : {}),
    }));
}

type LoadedPackageResult = {
  directoryName: string;
  examplePath: string;
  exampleId?: string | undefined;
  entry?: CatalogExample;
  errors: ValidationError[];
};

async function discoverDaemonPackages(repoRoot: string): Promise<ValidationResult<DaemonPackage[]>> {
  const daemonsDirectory = join(repoRoot, SOURCE_BASE_DIRECTORY);
  try {
    const stat = await lstat(daemonsDirectory);
    if (!stat.isDirectory()) {
      return {
        ok: false,
        errors: [
          machineError({
            code: 'invalid_repository_layout',
            path: SOURCE_BASE_DIRECTORY,
            message: 'daemons must be a directory.',
          }),
        ],
      };
    }
  } catch (error) {
    return {
      ok: false,
      errors: [
        machineError({
          code: 'invalid_repository_layout',
          path: SOURCE_BASE_DIRECTORY,
          message: `Unable to read daemons directory: ${normalizeThrownMessage(error)}`,
        }),
      ],
    };
  }

  const entries = await readdir(daemonsDirectory, { withFileTypes: true });
  const packages: DaemonPackage[] = [];
  const errors: ValidationError[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const entryPath = `daemons/${entry.name}`;
    if (!entry.isDirectory()) {
      errors.push(
        machineError({
          code: 'invalid_repository_layout',
          path: entryPath,
          message: 'Entries directly under daemons/ must be daemon package directories.',
        })
      );
      continue;
    }

    if (!isKebabCaseSlug(entry.name)) {
      errors.push(
        machineError({
          code: 'invalid_daemon_id',
          path: entryPath,
          message: 'Daemon package directory names must be stable kebab-case slugs.',
        })
      );
      continue;
    }

    packages.push({
      directoryName: entry.name,
      directoryPath: entryPath,
      daemonPath: `${entryPath}/DAEMON.md`,
      examplePath: `${entryPath}/example.yml`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors: sortValidationErrors(errors) };
  }

  return { ok: true, value: packages, errors: [] };
}

async function loadCatalogExample(
  repoRoot: string,
  daemonPackage: DaemonPackage,
  options: { publicationRef?: string }
): Promise<LoadedPackageResult> {
  const errors: ValidationError[] = [];
  const daemonDirectoryAbsolutePath = join(repoRoot, daemonPackage.directoryPath);

  errors.push(...(await validatePackageTopLevelEntries(daemonDirectoryAbsolutePath, daemonPackage.directoryPath)));

  const daemonContent = await readRequiredTextFile(repoRoot, daemonPackage.daemonPath, 'missing_daemon_md');
  if (!daemonContent.ok) {
    errors.push(...daemonContent.errors);
  }

  const exampleContent = await readRequiredTextFile(repoRoot, daemonPackage.examplePath, 'missing_example_yml');
  if (!exampleContent.ok) {
    errors.push(...exampleContent.errors);
  }

  let exampleMetadata: ExampleMetadata | undefined;
  let daemonFrontmatterId: string | undefined;

  if (exampleContent.ok) {
    const parsedExample = parseExampleYaml({ content: exampleContent.value, path: daemonPackage.examplePath });
    if (parsedExample.ok) {
      exampleMetadata = parsedExample.value;
    } else {
      errors.push(...parsedExample.errors);
    }
  }

  if (daemonContent.ok) {
    const parsedDaemon = parseDaemonMarkdown({ content: daemonContent.value, path: daemonPackage.daemonPath });
    if (parsedDaemon.ok) {
      daemonFrontmatterId = parsedDaemon.value.frontmatter.id;
    } else {
      errors.push(...parsedDaemon.errors);
    }
  }

  if (exampleMetadata && exampleMetadata.id !== daemonPackage.directoryName) {
    errors.push(
      machineError({
        code: 'id_mismatch',
        path: daemonPackage.examplePath,
        fieldPath: 'id',
        message: `example.yml id ${exampleMetadata.id} must match directory id ${daemonPackage.directoryName}.`,
      })
    );
  }

  if (daemonFrontmatterId && daemonFrontmatterId !== daemonPackage.directoryName) {
    errors.push(
      machineError({
        code: 'id_mismatch',
        path: daemonPackage.daemonPath,
        fieldPath: 'id',
        message: `DAEMON.md id ${daemonFrontmatterId} must match directory id ${daemonPackage.directoryName}.`,
      })
    );
  }

  if (exampleMetadata && daemonFrontmatterId && exampleMetadata.id !== daemonFrontmatterId) {
    errors.push(
      machineError({
        code: 'id_mismatch',
        path: daemonPackage.examplePath,
        fieldPath: 'id',
        message: `example.yml id ${exampleMetadata.id} must match DAEMON.md id ${daemonFrontmatterId}.`,
      })
    );
  }

  const supportPaths = await discoverSupportPaths(repoRoot, daemonPackage.directoryPath);
  errors.push(...supportPaths.errors);

  if (exampleMetadata && daemonContent.ok) {
    errors.push(
      ...(await validateDeclaredAdaptationTokens({
        repoRoot,
        daemonPackage,
        daemonContent: daemonContent.value,
        supportPaths: [...supportPaths.scripts, ...supportPaths.references],
        exampleMetadata,
      }))
    );
  }

  if (!exampleMetadata || !daemonContent.ok || errors.length > 0) {
    return {
      directoryName: daemonPackage.directoryName,
      examplePath: daemonPackage.examplePath,
      exampleId: exampleMetadata?.id,
      errors,
    };
  }

  const publicationRef = options.publicationRef ?? DEFAULT_PUBLICATION_REF;
  const sourceDirectory = `${SOURCE_BASE_DIRECTORY}/${daemonPackage.directoryName}`;

  return {
    directoryName: daemonPackage.directoryName,
    examplePath: daemonPackage.examplePath,
    exampleId: exampleMetadata.id,
    entry: {
      id: exampleMetadata.id,
      title: exampleMetadata.title,
      status: exampleMetadata.status,
      summary: exampleMetadata.summary,
      readiness: exampleMetadata.readiness,
      showOnWebsite: exampleMetadata.showOnWebsite,
      showInDashboard: exampleMetadata.showInDashboard,
      fit: {
        jobsToBeDone: exampleMetadata.fit.jobsToBeDone,
        bestFor: exampleMetadata.fit.bestFor,
        notFor: exampleMetadata.fit.notFor,
      },
      requirements: {
        requiredIntegrations: exampleMetadata.requirements.requiredIntegrations,
        optionalIntegrations: exampleMetadata.requirements.optionalIntegrations,
        other: exampleMetadata.requirements.other,
      },
      adaptations: catalogAdaptations(exampleMetadata.adaptations),
      specializationIdeas: [...exampleMetadata.specializationIdeas],
      daemon: {
        path: 'DAEMON.md',
        content: daemonContent.value,
      },
      scripts: supportPaths.scripts,
      references: supportPaths.references,
      source: {
        directory: sourceDirectory,
        url: `https://github.com/${SOURCE_REPOSITORY}/tree/${publicationRef}/${sourceDirectory}`,
      },
    },
    errors: [],
  };
}

async function validatePackageTopLevelEntries(
  daemonDirectoryAbsolutePath: string,
  daemonDirectoryPath: string
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const entries = await readdir(daemonDirectoryAbsolutePath, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (ALLOWED_DAEMON_PACKAGE_ENTRIES.has(entry.name)) {
      continue;
    }

    errors.push(
      machineError({
        code: entry.name === 'README.md' ? 'per_example_readme' : 'unsupported_support_path',
        path: `${daemonDirectoryPath}/${entry.name}`,
        message: 'Daemon packages may only contain DAEMON.md, example.yml, scripts/**, and references/**.',
      })
    );
  }

  return errors;
}

async function readRequiredTextFile(
  repoRoot: string,
  catalogPath: string,
  missingCode: 'missing_daemon_md' | 'missing_example_yml'
): Promise<ValidationResult<string>> {
  const absolutePath = join(repoRoot, catalogPath);
  try {
    const stat = await lstat(absolutePath);
    if (!stat.isFile()) {
      return {
        ok: false,
        errors: [
          machineError({
            code: missingCode,
            path: catalogPath,
            message: `${catalogPath} must be a file.`,
          }),
        ],
      };
    }

    return { ok: true, value: await readFile(absolutePath, 'utf8'), errors: [] };
  } catch (error) {
    return {
      ok: false,
      errors: [
        machineError({
          code: missingCode,
          path: catalogPath,
          message: `Unable to read required file: ${normalizeThrownMessage(error)}`,
        }),
      ],
    };
  }
}

async function discoverSupportPaths(
  repoRoot: string,
  daemonDirectoryPath: string
): Promise<{ scripts: string[]; references: string[]; errors: ValidationError[] }> {
  const scriptPaths = await discoverSupportDirectory(repoRoot, daemonDirectoryPath, 'scripts');
  const referencePaths = await discoverSupportDirectory(repoRoot, daemonDirectoryPath, 'references');

  return {
    scripts: scriptPaths.paths,
    references: referencePaths.paths,
    errors: [...scriptPaths.errors, ...referencePaths.errors],
  };
}

async function discoverSupportDirectory(
  repoRoot: string,
  daemonDirectoryPath: string,
  supportDirectoryName: 'scripts' | 'references'
): Promise<{ paths: string[]; errors: ValidationError[] }> {
  const supportDirectoryPath = `${daemonDirectoryPath}/${supportDirectoryName}`;
  const supportDirectoryAbsolutePath = join(repoRoot, supportDirectoryPath);
  try {
    await access(supportDirectoryAbsolutePath, constants.F_OK);
  } catch {
    return { paths: [], errors: [] };
  }

  const stat = await lstat(supportDirectoryAbsolutePath);
  if (!stat.isDirectory()) {
    return {
      paths: [],
      errors: [
        machineError({
          code: 'unsupported_support_path',
          path: supportDirectoryPath,
          message: `${supportDirectoryPath} must be a directory when present.`,
        }),
      ],
    };
  }

  const discovered = await walkSupportDirectory(repoRoot, supportDirectoryPath, supportDirectoryName);
  return {
    paths: discovered.paths.sort((left, right) => left.localeCompare(right)),
    errors: discovered.errors,
  };
}

async function walkSupportDirectory(
  repoRoot: string,
  currentDirectoryPath: string,
  supportDirectoryName: 'scripts' | 'references'
): Promise<{ paths: string[]; errors: ValidationError[] }> {
  const entries = await readdir(join(repoRoot, currentDirectoryPath), { withFileTypes: true });
  const paths: string[] = [];
  const errors: ValidationError[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = `${currentDirectoryPath}/${entry.name}`;
    const daemonRelativePath = toPosixPath(relative(join(repoRoot, currentDirectoryPath, '..'), join(repoRoot, entryPath)));

    if (entry.isDirectory()) {
      const nested = await walkSupportDirectory(repoRoot, entryPath, supportDirectoryName);
      paths.push(...nested.paths);
      errors.push(...nested.errors);
      continue;
    }

    const supportPath = entryPath.slice(entryPath.indexOf(`${supportDirectoryName}/`));
    if (!entry.isFile() || !isSupportPath(supportPath, supportDirectoryName)) {
      errors.push(
        machineError({
          code: 'unsupported_support_path',
          path: entryPath,
          message: `Unsupported support path: ${daemonRelativePath}.`,
        })
      );
      continue;
    }

    const absolutePath = join(repoRoot, entryPath);
    const content = await readFile(absolutePath, 'utf8');
    errors.push(...findPublicSafetyErrors({ content, path: entryPath }));

    if (supportDirectoryName === 'scripts') {
      const stat = await lstat(absolutePath);
      if (content.startsWith('#!') && (stat.mode & 0o111) === 0) {
        errors.push(
          machineError({
            code: 'script_not_executable',
            path: entryPath,
            message: 'Support scripts with a shebang must have executable file permissions.',
          })
        );
      }
    }

    paths.push(supportPath);
  }

  return { paths, errors };
}

async function validateDeclaredAdaptationTokens(args: {
  repoRoot: string;
  daemonPackage: DaemonPackage;
  daemonContent: string;
  supportPaths: readonly string[];
  exampleMetadata: ExampleMetadata;
}): Promise<ValidationError[]> {
  const declaredKeys = new Set(args.exampleMetadata.adaptations.map((adaptation) => adaptation.key));
  const errors = findAdaptationTokenErrors({
    content: args.daemonContent,
    path: args.daemonPackage.daemonPath,
    declaredKeys,
  });

  for (const supportPath of args.supportPaths) {
    const path = `${args.daemonPackage.directoryPath}/${supportPath}`;
    let content: string;
    try {
      content = await readFile(join(args.repoRoot, path), 'utf8');
    } catch (error) {
      errors.push(
        machineError({
          code: 'unsupported_support_path',
          path,
          message: `Unable to read support file: ${normalizeThrownMessage(error)}`,
        })
      );
      continue;
    }

    errors.push(...findAdaptationTokenErrors({ content, path, declaredKeys }));
  }

  return errors;
}

function findAdaptationTokenErrors(args: {
  content: string;
  path: string;
  declaredKeys: ReadonlySet<string>;
}): ValidationError[] {
  const errors: ValidationError[] = [];
  const reportedKeys = new Set<string>();
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
        machineError({
          code: 'malformed_adaptation_token',
          path: args.path,
          message: `Malformed adaptation token '${renderedToken}' is used in ${args.path}. Use '{{adapt.key}}' with a key matching ^[a-z][a-z0-9_]*$ and declare it in example.yml adaptations[].`,
        })
      );
      continue;
    }

    const key = expressionMatch[1] ?? '';
    if (args.declaredKeys.has(key) || reportedKeys.has(key)) {
      continue;
    }

    reportedKeys.add(key);
    errors.push(
      machineError({
        code: 'unknown_adaptation_token',
        path: args.path,
        message: `Adaptation token '{{adapt.${key}}}' is used in ${args.path}, but example.yml does not declare adaptations[].key '${key}'. Add the adaptation metadata or fix the token spelling.`,
      })
    );
  }

  return errors;
}

function findDuplicateIdErrors(results: readonly LoadedPackageResult[]): ValidationError[] {
  const pathsById = new Map<string, string[]>();
  for (const result of results) {
    if (!result.exampleId) {
      continue;
    }

    pathsById.set(result.exampleId, [...(pathsById.get(result.exampleId) ?? []), result.examplePath]);
  }

  const errors: ValidationError[] = [];
  for (const [id, paths] of pathsById.entries()) {
    if (paths.length < 2) {
      continue;
    }

    for (const path of paths) {
      errors.push(
        machineError({
          code: 'duplicate_id',
          path,
          fieldPath: 'id',
          message: `Duplicate example id ${id} appears in ${paths.join(', ')}.`,
        })
      );
    }
  }

  return errors;
}

function sortValidationErrors(errors: readonly ValidationError[]): ValidationError[] {
  return [...errors].sort((left, right) => {
    const pathComparison = left.path.localeCompare(right.path);
    if (pathComparison !== 0) {
      return pathComparison;
    }

    const leftField = left.fieldPath ?? '';
    const rightField = right.fieldPath ?? '';
    const fieldComparison = leftField.localeCompare(rightField);
    if (fieldComparison !== 0) {
      return fieldComparison;
    }

    return left.code.localeCompare(right.code);
  });
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
