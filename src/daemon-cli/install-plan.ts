import path from 'node:path';
import { CATALOG_SOURCE_BASE_DIRECTORY, DAEMON_FILENAME, DAEMON_ID_PATTERN, DEFAULT_DAEMON_ROOT } from './constants';
import { issue } from './issues';
import type { CliIssue, InstallFilePlan } from './types';
import type { CatalogExample } from '../examples/types';

export type DaemonInstallFileMode = '100644' | '100755';

export type DaemonInstallPlanFile = InstallFilePlan;

export type DaemonInstallPlan = {
  daemonId: string;
  destinationDirectory: string;
  files: DaemonInstallPlanFile[];
};

export type DaemonInstallPlanResult =
  | {
      ok: true;
      plan: DaemonInstallPlan;
    }
  | {
      ok: false;
      errors: CliIssue[];
    };

function validateSafeRelativePath(pathValue: string, field: string): CliIssue | null {
  if (pathValue.trim() !== pathValue || pathValue.length === 0) {
    return issue({ code: 'INVALID_CATALOG_PATH', message: `Catalog path '${pathValue}' must be non-empty with no surrounding whitespace.`, field });
  }
  if (pathValue.includes('\\') || pathValue.startsWith('/') || pathValue.includes('//')) {
    return issue({ code: 'INVALID_CATALOG_PATH', message: `Catalog path '${pathValue}' must be a normalized relative POSIX path.`, field });
  }
  const parts = pathValue.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    return issue({ code: 'INVALID_CATALOG_PATH', message: `Catalog path '${pathValue}' must not contain empty, '.', or '..' segments.`, field });
  }
  return null;
}

function isInsideDirectory(directory: string, candidatePath: string): boolean {
  const relativePath = path.relative(directory, candidatePath);
  return relativePath.length === 0 || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function validateDestinationPath(args: {
  destinationPath: string;
  destinationDirectory: string;
  field: string;
}): CliIssue | null {
  if (isInsideDirectory(args.destinationDirectory, args.destinationPath)) {
    return null;
  }

  return issue({
    code: 'INVALID_INSTALL_DESTINATION',
    message: `Install destination '${args.destinationPath}' must stay under '${args.destinationDirectory}'.`,
    field: args.field,
    path: args.destinationPath,
  });
}

function supportFileMode(kind: InstallFilePlan['kind']): DaemonInstallFileMode {
  return kind === 'script' ? '100755' : '100644';
}

function supportFilePlan(args: {
  entry: CatalogExample;
  destinationDirectory: string;
  supportPath: string;
  field: string;
  kind: 'script' | 'reference';
}): { file: InstallFilePlan; errors: CliIssue[] } {
  const errors: CliIssue[] = [];
  const invalid = validateSafeRelativePath(args.supportPath, args.field);
  if (invalid) errors.push(invalid);

  const expectedPrefix = args.kind === 'script' ? 'scripts/' : 'references/';
  if (!args.supportPath.startsWith(expectedPrefix)) {
    errors.push(
      issue({
        code: 'INVALID_CATALOG_SUPPORT_PATH',
        message: `${args.kind === 'script' ? 'Script' : 'Reference'} path '${args.supportPath}' must be under ${expectedPrefix}.`,
        field: args.field,
      })
    );
  }

  const destinationPath = path.join(args.destinationDirectory, ...args.supportPath.split('/'));
  const destinationError = validateDestinationPath({
    destinationPath,
    destinationDirectory: args.destinationDirectory,
    field: args.field,
  });
  if (destinationError) errors.push(destinationError);

  return {
    file: {
      sourcePath: `${args.entry.source.directory}/${args.supportPath}`,
      destinationPath,
      kind: args.kind,
      mode: supportFileMode(args.kind),
    },
    errors,
  };
}

export function createDaemonInstallPlan(args: { entry: CatalogExample; installRoot: string }): DaemonInstallPlanResult {
  const entry = args.entry;
  const errors: CliIssue[] = [];

  if (!DAEMON_ID_PATTERN.test(entry.id)) {
    errors.push(issue({ code: 'INVALID_DAEMON_ID', message: `Invalid example id '${entry.id}'. Expected kebab-case.`, field: 'id' }));
  }

  const sourceDirectoryError = validateSafeRelativePath(entry.source.directory, 'source.directory');
  if (sourceDirectoryError) errors.push(sourceDirectoryError);

  const expectedDirectory = `${CATALOG_SOURCE_BASE_DIRECTORY}/${entry.id}`;
  if (entry.source.directory !== expectedDirectory) {
    errors.push(
      issue({
        code: 'INVALID_CATALOG_SOURCE_DIRECTORY',
        message: `Catalog source directory '${entry.source.directory}' must match '${expectedDirectory}'.`,
        field: 'source.directory',
      })
    );
  }

  if (entry.daemon.path !== DAEMON_FILENAME) {
    errors.push(
      issue({
        code: 'INVALID_CATALOG_DAEMON_PATH',
        message: `Catalog daemon path '${entry.daemon.path}' must be '${DAEMON_FILENAME}'.`,
        field: 'daemon.path',
      })
    );
  }

  const destinationDirectory = path.resolve(args.installRoot, DEFAULT_DAEMON_ROOT, entry.id);
  const daemonDestinationPath = path.join(destinationDirectory, DAEMON_FILENAME);
  const daemonDestinationError = validateDestinationPath({
    destinationPath: daemonDestinationPath,
    destinationDirectory,
    field: 'daemon.path',
  });
  if (daemonDestinationError) errors.push(daemonDestinationError);

  const files: InstallFilePlan[] = [
    {
      sourcePath: `${entry.source.directory}/${DAEMON_FILENAME}`,
      destinationPath: daemonDestinationPath,
      kind: 'daemon',
      mode: '100644',
    },
  ];

  for (const [index, scriptPath] of entry.scripts.entries()) {
    const planned = supportFilePlan({
      entry,
      destinationDirectory,
      supportPath: scriptPath,
      field: `scripts[${index.toString()}]`,
      kind: 'script',
    });
    files.push(planned.file);
    errors.push(...planned.errors);
  }

  for (const [index, referencePath] of entry.references.entries()) {
    const planned = supportFilePlan({
      entry,
      destinationDirectory,
      supportPath: referencePath,
      field: `references[${index.toString()}]`,
      kind: 'reference',
    });
    files.push(planned.file);
    errors.push(...planned.errors);
  }

  if (files.some((file) => file.sourcePath.endsWith('/example.yml') || file.destinationPath.endsWith(`${path.sep}example.yml`))) {
    errors.push(issue({ code: 'INVALID_INSTALL_PLAN', message: 'Install plan must never include example.yml.' }));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    plan: {
      daemonId: entry.id,
      destinationDirectory,
      files,
    },
  };
}
