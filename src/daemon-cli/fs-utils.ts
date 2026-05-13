import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DEFAULT_DAEMON_ROOT, DAEMON_FILENAME } from './constants';

export async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findGitRoot(cwd: string): Promise<string | null> {
  return await new Promise((resolve) => {
    const child = spawn('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code === 0 && stdout.trim().length > 0) {
        resolve(stdout.trim());
      } else {
        resolve(null);
      }
    });
  });
}

export async function findInstallRoot(cwd: string): Promise<string> {
  return (await findGitRoot(cwd)) ?? cwd;
}

export async function writeTextFileEnsuringDirectory(args: {
  path: string;
  content: string;
  executable?: boolean;
}): Promise<void> {
  await mkdir(path.dirname(args.path), { recursive: true });
  await writeFile(args.path, args.content, 'utf8');
  if (args.executable) {
    await chmod(args.path, 0o755);
  }
}

export function toDisplayPath(root: string, absolutePath: string): string {
  const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, '/');
  return relativePath.length === 0 || relativePath.startsWith('..') ? absolutePath : relativePath;
}

export function expectedDaemonIdFromPath(filePath: string): string | null {
  const normalized = filePath.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.at(-1) !== DAEMON_FILENAME) {
    return null;
  }

  const daemonRootParts = DEFAULT_DAEMON_ROOT.split('/');
  for (let index = 0; index <= parts.length - daemonRootParts.length - 2; index += 1) {
    const maybeRoot = parts.slice(index, index + daemonRootParts.length).join('/');
    if (maybeRoot === DEFAULT_DAEMON_ROOT) {
      return parts[index + daemonRootParts.length] ?? null;
    }
  }

  const parent = parts.at(-2);
  return parent && parent !== '.' ? parent : null;
}

export async function discoverRuntimeDaemonFiles(root: string): Promise<string[]> {
  const daemonRoot = path.join(root, DEFAULT_DAEMON_ROOT);
  if (!(await pathExists(daemonRoot))) {
    return [];
  }

  const found: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === DAEMON_FILENAME) {
        found.push(entryPath);
      }
    }
  }

  const rootStat = await stat(daemonRoot);
  if (!rootStat.isDirectory()) {
    return [];
  }

  await walk(daemonRoot);
  return found.sort((left, right) => left.localeCompare(right));
}

export async function readUtf8File(pathValue: string): Promise<string> {
  return await readFile(pathValue, 'utf8');
}
