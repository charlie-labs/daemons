export const DAEMON_CLI_VERSION = '0.0.1';

export const EXIT_CODE_SUCCESS = 0;
export const EXIT_CODE_USAGE = 64;
export const EXIT_CODE_DATA = 65;
export const EXIT_CODE_INTERNAL = 70;

export const SOURCE_REPO = 'charlie-labs/daemons';
export const SOURCE_REPO_OWNER = 'charlie-labs';
export const SOURCE_REPO_NAME = 'daemons';
export const DEFAULT_CATALOG_REF = 'master';
export const CATALOG_PATH = 'examples.json';
export const SUPPORTED_CATALOG_SCHEMA_VERSION = 1;
export const CATALOG_SOURCE_BASE_DIRECTORY = 'daemons';

export const DEFAULT_DAEMON_ROOT = '.agents/daemons';
export const DAEMON_FILENAME = 'DAEMON.md';
export const DAEMON_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ACTIVATION_CAVEAT =
  'Scaffolding writes files only. The daemon is not active until the change is merged to the target repo default branch and ingested by Charlie.';

export const canonicalFrontmatterKeys = [
  'id',
  'purpose',
  'watch',
  'routines',
  'deny',
  'schedule',
] as const;

export const legacyFrontmatterKeyToCanonicalField = {
  name: 'id',
  description: 'purpose',
  triggers: 'watch',
  actions: 'routines',
  disallowed: 'deny',
} as const;

export const catalogMetadataFrontmatterKeys = [
  'title',
  'summary',
  'status',
  'readiness',
  'showOnWebsite',
  'showInDashboard',
  'fit',
  'requirements',
  'adaptation',
  'scripts',
  'references',
  'source',
  'daemon',
  'riskTier',
  'activationMode',
  'display',
  'metadata',
  'bestFor',
] as const;

export const commandAliases = {
  list: 'list',
  show: 'show',
  add: 'add',
  install: 'add',
  validate: 'validate',
} as const;

export type CommandName = keyof typeof commandAliases;
export type ResolvedCommandName = (typeof commandAliases)[CommandName];
