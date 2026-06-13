import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  ACTIVATION_CAVEAT,
  DAEMON_ID_PATTERN,
  DEFAULT_CATALOG_REF,
  DEFAULT_DAEMON_ROOT,
  EXIT_CODE_DATA,
  EXIT_CODE_INTERNAL,
  EXIT_CODE_SUCCESS,
  EXIT_CODE_USAGE,
  SOURCE_REPO,
} from './constants';
import {
  discoverRuntimeDaemonFiles,
  expectedDaemonIdFromPath,
  findGitRoot,
  findInstallRoot,
  pathExists,
  readUtf8File,
  toDisplayPath,
  writeTextFileEnsuringDirectory,
} from './fs-utils';
import {
  knownAdaptationKeys,
  parseAdaptFileContent,
  parseAdaptFlags,
  renderAdaptationTokens,
  resolveAdaptations,
  type AdaptationResolution,
} from './adaptations';
import { createDaemonInstallPlan } from './install-plan';
import { issue, normalizeErrorMessage } from './issues';
import type {
  AddData,
  CatalogClient,
  CliCommandResult,
  CliIssue,
  InstallFilePlan,
  ListData,
  ShowData,
  ValidateData,
  ValidateFileResult,
} from './types';
import { validateRuntimeDaemonMarkdown } from './validation/runtime';
import type { CatalogExample } from '../examples/types';

function usageResult(command: string, summary: string): CliCommandResult {
  return {
    command,
    ok: false,
    exitCode: EXIT_CODE_USAGE,
    summary,
    warnings: [],
    errors: [issue({ code: 'USAGE_ERROR', message: summary })],
    data: null,
  };
}

function usageIssuesResult(command: string, summary: string, errors: CliIssue[]): CliCommandResult {
  return {
    command,
    ok: false,
    exitCode: EXIT_CODE_USAGE,
    summary,
    warnings: [],
    errors,
    data: null,
  };
}

function internalResult(command: string, error: unknown): CliCommandResult {
  return {
    command,
    ok: false,
    exitCode: EXIT_CODE_INTERNAL,
    summary: `Internal error while running '${command}'.`,
    warnings: [],
    errors: [issue({ code: 'INTERNAL_ERROR', message: normalizeErrorMessage(error) })],
    data: null,
  };
}

function catalogErrorResult(command: string, error: unknown): CliCommandResult {
  const code = error instanceof Error && 'code' in error ? String(error.code) : 'CATALOG_ERROR';
  const pathValue = error instanceof Error && 'path' in error ? String(error.path) : null;
  return {
    command,
    ok: false,
    exitCode: EXIT_CODE_DATA,
    summary: `Unable to read daemon examples catalog.`,
    warnings: [],
    errors: [issue({ code, message: normalizeErrorMessage(error), path: pathValue })],
    data: null,
  };
}

function parseRefOnly(command: string, commandArgs: readonly string[]):
  | { ok: true; ref: string }
  | { ok: false; result: CliCommandResult } {
  try {
    const parsed = parseArgs({
      args: [...commandArgs],
      options: {
        ref: { type: 'string' },
      },
      allowPositionals: false,
      strict: true,
    });
    return { ok: true, ref: parsed.values.ref ?? DEFAULT_CATALOG_REF };
  } catch (error) {
    return { ok: false, result: usageResult(command, normalizeErrorMessage(error)) };
  }
}

function findCatalogEntry(catalogExamples: readonly CatalogExample[], exampleId: string): CatalogExample | null {
  return catalogExamples.find((example) => example.id === exampleId) ?? null;
}

function listItem(entry: CatalogExample) {
  return {
    id: entry.id,
    title: entry.title,
    status: entry.status,
    readiness: entry.readiness,
    summary: entry.summary,
  };
}

function adaptationsFor(entry: CatalogExample): string[] {
  return [...entry.adaptation.mustCustomize];
}

export async function runListCommand(args: {
  commandArgs: readonly string[];
  catalogClient: CatalogClient;
}): Promise<CliCommandResult<ListData>> {
  const parsed = parseRefOnly('list', args.commandArgs);
  if (!parsed.ok) return parsed.result as CliCommandResult<ListData>;

  try {
    const catalog = await args.catalogClient.loadCatalog(parsed.ref);
    const examples = catalog.examples.map(listItem);
    return {
      command: 'list',
      ok: true,
      exitCode: EXIT_CODE_SUCCESS,
      summary: `Found ${examples.length.toString()} daemon example${examples.length === 1 ? '' : 's'}.`,
      warnings: [],
      errors: [],
      data: {
        sourceRepo: SOURCE_REPO,
        sourceRef: parsed.ref,
        schemaVersion: catalog.schemaVersion,
        count: examples.length,
        exampleIds: examples.map((example) => example.id),
        examples,
      },
    };
  } catch (error) {
    return catalogErrorResult('list', error) as CliCommandResult<ListData>;
  }
}

export async function runShowCommand(args: {
  commandArgs: readonly string[];
  catalogClient: CatalogClient;
}): Promise<CliCommandResult<ShowData>> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args.commandArgs],
      options: { ref: { type: 'string' } },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usageResult('show', normalizeErrorMessage(error)) as CliCommandResult<ShowData>;
  }

  if (parsed.positionals.length !== 1) {
    return usageResult('show', 'Expected exactly one example id: daemon show <example-id>.') as CliCommandResult<ShowData>;
  }

  const exampleId = parsed.positionals[0];
  if (!exampleId || !DAEMON_ID_PATTERN.test(exampleId)) {
    return usageResult('show', `Invalid example id '${exampleId ?? ''}'. Expected kebab-case.`) as CliCommandResult<ShowData>;
  }

  const ref = parsed.values.ref ?? DEFAULT_CATALOG_REF;
  try {
    const catalog = await args.catalogClient.loadCatalog(ref);
    const entry = findCatalogEntry(catalog.examples, exampleId);
    if (!entry) {
      return {
        command: 'show',
        ok: false,
        exitCode: EXIT_CODE_DATA,
        summary: `No daemon example found for '${exampleId}'.`,
        warnings: [],
        errors: [issue({ code: 'EXAMPLE_NOT_FOUND', message: `No daemon example found for '${exampleId}'.` })],
        data: null,
      };
    }

    return {
      command: 'show',
      ok: true,
      exitCode: EXIT_CODE_SUCCESS,
      summary: `${entry.id}: ${entry.title}`,
      warnings: [],
      errors: [],
      data: {
        ...listItem(entry),
        sourceRepo: SOURCE_REPO,
        sourceRef: ref,
        requiredIntegrations: [...entry.requirements.requiredIntegrations],
        optionalIntegrations: [...entry.requirements.optionalIntegrations],
        otherRequirements: [...entry.requirements.other],
        scripts: [...entry.scripts],
        references: [...entry.references],
        daemonPath: entry.daemon.path,
        sourceDirectory: entry.source.directory,
        sourceUrl: entry.source.url,
        adaptationsRequired: adaptationsFor(entry),
        adaptations: [...(entry.adaptations ?? [])],
        specializationIdeas: [...entry.specializationIdeas],
        activationRequired: ACTIVATION_CAVEAT,
      },
    };
  } catch (error) {
    return catalogErrorResult('show', error) as CliCommandResult<ShowData>;
  }
}

async function findCollisions(files: readonly InstallFilePlan[], installRoot: string, destinationDirectory: string): Promise<string[]> {
  const collisions: string[] = [];
  if (await pathExists(destinationDirectory)) {
    collisions.push(`${toDisplayPath(installRoot, destinationDirectory)}/`);
  }
  for (const file of files) {
    if (await pathExists(file.destinationPath)) {
      collisions.push(toDisplayPath(installRoot, file.destinationPath));
    }
  }
  return collisions.sort((left, right) => left.localeCompare(right));
}

function addDataForBlocked(args: {
  entry: CatalogExample;
  ref: string;
  installRoot: string;
  files: InstallFilePlan[];
  dryRun: boolean;
  force: boolean;
  collisions: string[];
  deprecatedBlocked: boolean;
  adaptationsApplied?: string[] | undefined;
}): AddData {
  const destinationDirectory = path.join(args.installRoot, DEFAULT_DAEMON_ROOT, args.entry.id);
  return {
    daemonId: args.entry.id,
    filePath: toDisplayPath(args.installRoot, destinationDirectory),
    targetRoot: args.installRoot,
    dryRun: args.dryRun,
    force: args.force,
    overwritten: false,
    mode: 'remote',
    fileCount: args.files.length,
    sourceRepo: SOURCE_REPO,
    sourceRef: args.ref,
    status: args.entry.status,
    readiness: args.entry.readiness,
    adaptationsRequired: adaptationsFor(args.entry),
    adaptationsApplied: args.adaptationsApplied ?? [],
    activationRequired: ACTIVATION_CAVEAT,
    filesPlanned: args.files.map((file) => ({
      ...file,
      destinationPath: toDisplayPath(args.installRoot, file.destinationPath),
    })),
    filesWritten: [],
    collisions: args.collisions,
    deprecatedBlocked: args.deprecatedBlocked,
  };
}


type RenderedInstallFile = InstallFilePlan & {
  content: string;
};

function dataErrorResult<TData>(command: string, summary: string, errors: CliIssue[], data: TData | null): CliCommandResult<TData> {
  return {
    command,
    ok: false,
    exitCode: EXIT_CODE_DATA,
    summary,
    warnings: [],
    errors,
    data,
  };
}

async function loadAdaptFileValues(args: { cwd: string; adaptFile: string | undefined }): Promise<
  | { ok: true; fileValues: Map<string, string>; displayPath: string | null }
  | { ok: false; errors: CliIssue[] }
> {
  if (!args.adaptFile) {
    return { ok: true, fileValues: new Map(), displayPath: null };
  }

  const absolutePath = path.resolve(args.cwd, args.adaptFile);
  const displayPath = toDisplayPath(args.cwd, absolutePath);
  try {
    const content = await readUtf8File(absolutePath);
    const parsed = parseAdaptFileContent({ content, path: displayPath });
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors };
    }
    return { ok: true, fileValues: parsed.values, displayPath };
  } catch (error) {
    return {
      ok: false,
      errors: [issue({ code: 'ADAPT_FILE_READ_FAILED', message: normalizeErrorMessage(error), path: displayPath })],
    };
  }
}

async function renderInstallFiles(args: {
  entry: CatalogExample;
  ref: string;
  catalogClient: CatalogClient;
  installRoot: string;
  files: readonly InstallFilePlan[];
  resolution: AdaptationResolution;
}): Promise<{ ok: true; files: RenderedInstallFile[] } | { ok: false; errors: CliIssue[] }> {
  const renderedFiles: RenderedInstallFile[] = [];
  const errors: CliIssue[] = [];
  const knownKeys = knownAdaptationKeys(args.entry);

  for (const file of args.files) {
    const content =
      file.kind === 'daemon'
        ? args.entry.daemon.content
        : await args.catalogClient.readTextFile(args.ref, file.sourcePath);
    const displayPath = toDisplayPath(args.installRoot, file.destinationPath);
    const rendered = renderAdaptationTokens({
      content,
      values: args.resolution.values,
      knownKeys,
      path: displayPath,
    });
    if (!rendered.ok) {
      errors.push(...rendered.errors);
      continue;
    }
    renderedFiles.push({ ...file, content: rendered.content });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const daemonFile = renderedFiles.find((file) => file.kind === 'daemon');
  if (!daemonFile) {
    return {
      ok: false,
      errors: [issue({ code: 'INSTALL_PLAN_MISSING_DAEMON', message: 'Install plan did not include DAEMON.md.' })],
    };
  }

  const daemonDisplayPath = toDisplayPath(args.installRoot, daemonFile.destinationPath);
  const validation = validateRuntimeDaemonMarkdown({
    content: daemonFile.content,
    path: daemonDisplayPath,
    expectedId: expectedDaemonIdFromPath(daemonDisplayPath),
  });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  return { ok: true, files: renderedFiles };
}

export async function runAddCommand(args: {
  commandName: 'add' | 'install';
  commandArgs: readonly string[];
  cwd: string;
  catalogClient: CatalogClient;
}): Promise<CliCommandResult<AddData>> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args.commandArgs],
      options: {
        ref: { type: 'string' },
        force: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'allow-deprecated': { type: 'boolean', default: false },
        adapt: { type: 'string', multiple: true },
        'adapt-file': { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usageResult(args.commandName, normalizeErrorMessage(error)) as CliCommandResult<AddData>;
  }

  if (parsed.positionals.length !== 1) {
    return usageResult(args.commandName, `Expected exactly one example id: daemon ${args.commandName} <example-id>.`) as CliCommandResult<AddData>;
  }

  const exampleId = parsed.positionals[0];
  if (!exampleId || !DAEMON_ID_PATTERN.test(exampleId)) {
    return usageResult(args.commandName, `Invalid example id '${exampleId ?? ''}'. Expected kebab-case.`) as CliCommandResult<AddData>;
  }

  const ref = parsed.values.ref ?? DEFAULT_CATALOG_REF;
  const force = parsed.values.force === true;
  const dryRun = parsed.values['dry-run'] === true;
  const allowDeprecated = parsed.values['allow-deprecated'] === true;
  const adaptFile = parsed.values['adapt-file'];
  const parsedAdaptFlags = parseAdaptFlags(parsed.values.adapt);
  if (!parsedAdaptFlags.ok) {
    return usageIssuesResult(args.commandName, 'Invalid adaptation flags.', parsedAdaptFlags.errors) as CliCommandResult<AddData>;
  }

  try {
    const [catalog, installRoot] = await Promise.all([
      args.catalogClient.loadCatalog(ref),
      findInstallRoot(args.cwd),
    ]);
    const entry = findCatalogEntry(catalog.examples, exampleId);
    if (!entry) {
      return {
        command: args.commandName,
        ok: false,
        exitCode: EXIT_CODE_DATA,
        summary: `No daemon example found for '${exampleId}'.`,
        warnings: [],
        errors: [issue({ code: 'EXAMPLE_NOT_FOUND', message: `No daemon example found for '${exampleId}'.` })],
        data: null,
      };
    }

    const installPlanResult = createDaemonInstallPlan({ entry, installRoot });
    if (!installPlanResult.ok) {
      return {
        command: args.commandName,
        ok: false,
        exitCode: EXIT_CODE_DATA,
        summary: `Catalog entry '${exampleId}' cannot be installed safely.`,
        warnings: [],
        errors: installPlanResult.errors,
        data: null,
      };
    }

    const installPlan = installPlanResult.plan;
    const destinationDirectory = installPlan.destinationDirectory;
    const collisions = await findCollisions(installPlan.files, installRoot, destinationDirectory);
    if (entry.status === 'deprecated' && !allowDeprecated) {
      return {
        command: args.commandName,
        ok: false,
        exitCode: EXIT_CODE_DATA,
        summary: `Refusing to install deprecated daemon example '${exampleId}'. Re-run with --allow-deprecated if you intentionally need it.`,
        warnings: [],
        errors: [issue({ code: 'DEPRECATED_EXAMPLE_BLOCKED', message: `Example '${exampleId}' is deprecated.` })],
        data: addDataForBlocked({ entry, ref, installRoot, files: installPlan.files, dryRun, force, collisions, deprecatedBlocked: true }),
      };
    }

    if (collisions.length > 0 && !force) {
      return {
        command: args.commandName,
        ok: false,
        exitCode: EXIT_CODE_DATA,
        summary: `Refusing to overwrite ${collisions.length.toString()} existing daemon file${collisions.length === 1 ? '' : 's'}. Re-run with --force to overwrite catalog-managed files.`,
        warnings: [],
        errors: collisions.map((collision) => issue({ code: 'INSTALL_COLLISION', message: `Destination already exists: ${collision}`, path: collision })),
        data: addDataForBlocked({ entry, ref, installRoot, files: installPlan.files, dryRun, force, collisions, deprecatedBlocked: false }),
      };
    }

    const fileValues = await loadAdaptFileValues({ cwd: args.cwd, adaptFile });
    if (!fileValues.ok) {
      return dataErrorResult(
        args.commandName,
        'Unable to read adaptation inputs.',
        fileValues.errors,
        addDataForBlocked({ entry, ref, installRoot, files: installPlan.files, dryRun, force, collisions, deprecatedBlocked: false })
      );
    }

    const adaptationResolution = resolveAdaptations({
      entry,
      fileValues: fileValues.fileValues,
      cliValues: parsedAdaptFlags.values,
      filePath: fileValues.displayPath,
    });
    if (!adaptationResolution.ok) {
      return dataErrorResult(
        args.commandName,
        `Adaptation inputs for '${exampleId}' are incomplete or invalid.`,
        adaptationResolution.errors,
        addDataForBlocked({ entry, ref, installRoot, files: installPlan.files, dryRun, force, collisions, deprecatedBlocked: false })
      );
    }

    const rendered = await renderInstallFiles({
      entry,
      ref,
      catalogClient: args.catalogClient,
      installRoot,
      files: installPlan.files,
      resolution: adaptationResolution.resolution,
    });
    if (!rendered.ok) {
      return dataErrorResult(
        args.commandName,
        `Rendered daemon example '${exampleId}' is invalid.`,
        rendered.errors,
        addDataForBlocked({
          entry,
          ref,
          installRoot,
          files: installPlan.files,
          dryRun,
          force,
          collisions,
          deprecatedBlocked: false,
          adaptationsApplied: adaptationResolution.resolution.appliedKeys,
        })
      );
    }

    const filesWritten: string[] = [];

    if (!dryRun) {
      await mkdir(destinationDirectory, { recursive: true });
      for (const file of rendered.files) {
        await writeTextFileEnsuringDirectory({
          path: file.destinationPath,
          content: file.content,
          mode: file.mode,
        });
        filesWritten.push(toDisplayPath(installRoot, file.destinationPath));
      }
    }

    const data: AddData = {
      daemonId: entry.id,
      filePath: toDisplayPath(installRoot, destinationDirectory),
      targetRoot: installRoot,
      dryRun,
      force,
      overwritten: collisions.length > 0,
      mode: 'remote',
      fileCount: installPlan.files.length,
      sourceRepo: SOURCE_REPO,
      sourceRef: ref,
      status: entry.status,
      readiness: entry.readiness,
      adaptationsRequired: adaptationsFor(entry),
      adaptationsApplied: adaptationResolution.resolution.appliedKeys,
      activationRequired: ACTIVATION_CAVEAT,
      filesPlanned: installPlan.files.map((file) => ({ ...file, destinationPath: toDisplayPath(installRoot, file.destinationPath) })),
      filesWritten,
      collisions,
      deprecatedBlocked: false,
    };

    return {
      command: args.commandName,
      ok: true,
      exitCode: EXIT_CODE_SUCCESS,
      summary: dryRun
        ? `Dry run: would scaffold '${entry.id}' into ${data.filePath}. Applied adaptation keys: ${data.adaptationsApplied.length.toString()}.`
        : `Scaffolded '${entry.id}' into ${data.filePath}. Applied adaptation keys: ${data.adaptationsApplied.length.toString()}; daemon is not active yet.`,
      warnings: [],
      errors: [],
      data,
    };
  } catch (error) {
    if (error instanceof Error && ('code' in error || error.name === 'CatalogClientError')) {
      return catalogErrorResult(args.commandName, error) as CliCommandResult<AddData>;
    }
    return internalResult(args.commandName, error) as CliCommandResult<AddData>;
  }
}

async function validateOneFile(args: { filePath: string; root: string }): Promise<ValidateFileResult> {
  const displayPath = toDisplayPath(args.root, args.filePath);
  try {
    const content = await readUtf8File(args.filePath);
    const expectedId = expectedDaemonIdFromPath(displayPath);
    const result = validateRuntimeDaemonMarkdown({ content, path: displayPath, expectedId });
    return {
      filePath: displayPath,
      ok: result.ok,
      warnings: result.warnings,
      errors: result.errors,
      daemon: result.ok ? result.daemon : null,
    };
  } catch (error) {
    return {
      filePath: displayPath,
      ok: false,
      warnings: [],
      errors: [issue({ code: 'DAEMON_FILE_READ_FAILED', message: normalizeErrorMessage(error), path: displayPath })],
      daemon: null,
    };
  }
}

export async function runValidateCommand(args: {
  commandArgs: readonly string[];
  cwd: string;
}): Promise<CliCommandResult<ValidateData>> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args.commandArgs],
      options: {
        all: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usageResult('validate', normalizeErrorMessage(error)) as CliCommandResult<ValidateData>;
  }

  const dryRun = parsed.values['dry-run'] === true;
  const all = parsed.values.all === true;
  if (all && parsed.positionals.length > 0) {
    return usageResult('validate', 'Use either daemon validate <path> or daemon validate --all, not both.') as CliCommandResult<ValidateData>;
  }
  if (!all && parsed.positionals.length !== 1) {
    return usageResult('validate', 'Expected daemon validate <path> or daemon validate --all.') as CliCommandResult<ValidateData>;
  }

  try {
    const validationRoot = (await findGitRoot(args.cwd)) ?? args.cwd;
    const files = all
      ? await discoverRuntimeDaemonFiles(validationRoot)
      : [path.resolve(args.cwd, parsed.positionals[0] as string)];
    const results = await Promise.all(files.map((filePath) => validateOneFile({ filePath, root: validationRoot })));
    const validCount = results.filter((result) => result.ok).length;
    const invalidCount = results.length - validCount;
    const warnings: CliIssue[] = [];
    if (dryRun) {
      warnings.push(issue({ code: 'VALIDATE_DRY_RUN_NOOP', message: 'Validation is read-only; --dry-run did not change behavior.' }));
    }
    if (all && files.length === 0) {
      warnings.push(issue({ code: 'NO_DAEMON_FILES_FOUND', message: `No runtime daemon files found under ${DEFAULT_DAEMON_ROOT}.` }));
    }

    const data: ValidateData = {
      dryRun,
      root: validationRoot,
      fileCount: results.length,
      validCount,
      invalidCount,
      files: results,
    };

    return {
      command: 'validate',
      ok: invalidCount === 0,
      exitCode: invalidCount === 0 ? EXIT_CODE_SUCCESS : EXIT_CODE_DATA,
      summary: `Validated ${results.length.toString()} daemon file${results.length === 1 ? '' : 's'}: ${validCount.toString()} valid, ${invalidCount.toString()} invalid.`,
      warnings,
      errors: results.flatMap((result) => result.errors),
      data,
    };
  } catch (error) {
    return internalResult('validate', error) as CliCommandResult<ValidateData>;
  }
}
