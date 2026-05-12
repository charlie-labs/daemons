import { posix } from 'node:path';

export function isKebabCaseSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function toPosixPath(pathValue: string): string {
  return pathValue.replaceAll('\\', '/');
}

export function isNormalizedRelativeFilePath(pathValue: string): boolean {
  if (pathValue.length === 0) {
    return false;
  }

  if (pathValue.startsWith('/') || pathValue.includes('\\')) {
    return false;
  }

  if (pathValue.includes('//')) {
    return false;
  }

  const parts = pathValue.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    return false;
  }

  return posix.normalize(pathValue) === pathValue;
}

export function isSupportPath(pathValue: string, supportDirectory: 'scripts' | 'references'): boolean {
  return (
    isNormalizedRelativeFilePath(pathValue) &&
    pathValue.startsWith(`${supportDirectory}/`) &&
    pathValue.length > supportDirectory.length + 1
  );
}
