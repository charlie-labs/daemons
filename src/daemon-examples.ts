import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExamplesCatalogContent } from './examples/schema';
import type { CatalogExample, ExamplesCatalog, ValidationError } from './examples/types';

export type DaemonExample = CatalogExample;
export type DaemonExamplesCatalog = ExamplesCatalog;

export type LoadDaemonExamplesCatalogOptions = {
  /** Override the catalog path. Defaults to the packaged repository-root examples.json. */
  catalogPath?: string | URL | undefined;
};

export class DaemonExamplesCatalogError extends Error {
  readonly code: string;
  readonly path: string;
  readonly validationErrors: ValidationError[];

  constructor(args: { code: string; path: string; message: string; validationErrors?: ValidationError[] | undefined }) {
    super(args.message);
    this.name = 'DaemonExamplesCatalogError';
    this.code = args.code;
    this.path = args.path;
    this.validationErrors = args.validationErrors ?? [];
  }
}

function defaultCatalogPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'examples.json');
}

function catalogPathForDisplay(catalogPath: string | URL): string {
  return catalogPath instanceof URL ? catalogPath.href : catalogPath;
}

export async function loadDaemonExamplesCatalog(
  options: LoadDaemonExamplesCatalogOptions = {}
): Promise<DaemonExamplesCatalog> {
  const catalogPath = options.catalogPath ?? defaultCatalogPath();
  const displayPath = catalogPathForDisplay(catalogPath);

  let content: string;
  try {
    content = await readFile(catalogPath, 'utf8');
  } catch (error) {
    throw new DaemonExamplesCatalogError({
      code: 'CATALOG_READ_FAILED',
      path: displayPath,
      message: `Unable to read daemon examples catalog at ${displayPath}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const parsed = parseExamplesCatalogContent({ content, path: displayPath });
  if (!parsed.ok) {
    throw new DaemonExamplesCatalogError({
      code: 'INVALID_CATALOG',
      path: displayPath,
      message: `Daemon examples catalog at ${displayPath} is invalid.`,
      validationErrors: parsed.errors,
    });
  }

  return parsed.value;
}

export async function listDaemonExamples(
  options: LoadDaemonExamplesCatalogOptions = {}
): Promise<DaemonExample[]> {
  const catalog = await loadDaemonExamplesCatalog(options);
  return [...catalog.examples];
}

export async function getDaemonExample(
  id: string,
  options: LoadDaemonExamplesCatalogOptions = {}
): Promise<DaemonExample | null> {
  const catalog = await loadDaemonExamplesCatalog(options);
  return catalog.examples.find((example) => example.id === id) ?? null;
}
