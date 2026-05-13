import type { CatalogExample, ExamplesCatalog } from '../examples/types';

export type CliIssue = {
  code: string;
  message: string;
  field: string | null;
  path: string | null;
};

export type CliCommandResult<TData = unknown> = {
  command: string;
  ok: boolean;
  exitCode: number;
  summary: string;
  warnings: CliIssue[];
  errors: CliIssue[];
  data: TData | null;
};

export type CatalogClient = {
  loadCatalog(ref: string): Promise<ExamplesCatalog>;
  readTextFile(ref: string, path: string): Promise<string>;
};

export type CatalogListItem = {
  id: string;
  title: string;
  status: CatalogExample['status'];
  readiness: CatalogExample['readiness'];
  summary: string;
};

export type ListData = {
  sourceRepo: string;
  sourceRef: string;
  schemaVersion: number;
  count: number;
  exampleIds: string[];
  examples: CatalogListItem[];
};

export type ShowData = CatalogListItem & {
  sourceRepo: string;
  sourceRef: string;
  requiredIntegrations: string[];
  optionalIntegrations: string[];
  otherRequirements: string[];
  scripts: string[];
  references: string[];
  daemonPath: string;
  sourceDirectory: string;
  sourceUrl: string;
  adaptationsRequired: string[];
  activationRequired: string;
};

export type InstallFilePlan = {
  sourcePath: string;
  destinationPath: string;
  kind: 'daemon' | 'script' | 'reference';
};

export type AddData = {
  daemonId: string;
  filePath: string;
  targetRoot: string;
  dryRun: boolean;
  force: boolean;
  overwritten: boolean;
  mode: 'remote';
  fileCount: number;
  sourceRepo: string;
  sourceRef: string;
  status: CatalogExample['status'];
  readiness: CatalogExample['readiness'];
  adaptationsRequired: string[];
  activationRequired: string;
  filesPlanned: InstallFilePlan[];
  filesWritten: string[];
  collisions: string[];
  deprecatedBlocked: boolean;
};

export type RuntimeDaemon = {
  id: string;
  purpose: string;
  watch: string[];
  routines: string[];
  deny: string[];
  schedule: string | null;
  bodyLength: number;
};

export type ValidateFileResult = {
  filePath: string;
  ok: boolean;
  warnings: CliIssue[];
  errors: CliIssue[];
  daemon: RuntimeDaemon | null;
};

export type ValidateData = {
  dryRun: boolean;
  root: string;
  fileCount: number;
  validCount: number;
  invalidCount: number;
  files: ValidateFileResult[];
};

export type HelpData = {
  topic: string;
  text: string;
};

export type VersionData = {
  version: string;
};
