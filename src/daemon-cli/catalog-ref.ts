const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const DEFAULT_CATALOG_SCHEMA_TAG_PREFIX = 'examples-schema-v';

type DefaultCatalogRefFailure = {
  ok: false;
  code: 'DEFAULT_CATALOG_REF_VERSION_INVALID' | 'DEFAULT_CATALOG_REF_UNAVAILABLE';
  message: string;
  packageVersion: string;
};

export type DefaultCatalogRefResolution =
  | {
      ok: true;
      ref: string;
      schemaVersion: number;
      packageVersion: string;
    }
  | DefaultCatalogRefFailure;

export type CatalogRefResolution =
  | {
      ok: true;
      ref: string;
      schemaVersion: number | null;
      packageVersion: string;
      source: 'explicit' | 'default';
    }
  | DefaultCatalogRefFailure;

export function catalogRefForSchemaVersion(schemaVersion: number): string {
  return `${DEFAULT_CATALOG_SCHEMA_TAG_PREFIX}${schemaVersion.toString()}`;
}

export function resolveDefaultCatalogRefForPackageVersion(packageVersion: string): DefaultCatalogRefResolution {
  const match = packageVersion.match(SEMVER_PATTERN);
  if (!match) {
    return {
      ok: false,
      code: 'DEFAULT_CATALOG_REF_VERSION_INVALID',
      packageVersion,
      message: `Cannot determine a default daemon examples catalog ref because package.json#version (${JSON.stringify(packageVersion)}) is not valid semver. Re-run with --ref <sha|branch|tag>.`,
    };
  }

  const major = Number.parseInt(match[1] as string, 10);
  if (major === 1) {
    return {
      ok: false,
      code: 'DEFAULT_CATALOG_REF_UNAVAILABLE',
      packageVersion,
      message: `daemon CLI version ${packageVersion} does not have a default examples catalog schema ref. Re-run with --ref <sha|branch|tag>.`,
    };
  }

  const schemaVersion = major === 0 ? 1 : major;
  return {
    ok: true,
    ref: catalogRefForSchemaVersion(schemaVersion),
    schemaVersion,
    packageVersion,
  };
}

export function resolveCatalogRef(args: {
  explicitRef: string | undefined;
  packageVersion: string;
}): CatalogRefResolution {
  if (args.explicitRef !== undefined) {
    return {
      ok: true,
      ref: args.explicitRef,
      schemaVersion: null,
      packageVersion: args.packageVersion,
      source: 'explicit',
    };
  }

  const defaultRef = resolveDefaultCatalogRefForPackageVersion(args.packageVersion);
  if (!defaultRef.ok) {
    return defaultRef;
  }

  return { ...defaultRef, source: 'default' };
}
