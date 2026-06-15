#!/usr/bin/env bun

import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const requiredPackageFiles = [
  'dist/bin.js',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/examples.json',
  'examples.json',
  'package.json',
  'README.md',
  'CHANGELOG.md',
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function run(command: string, args: readonly string[], cwd: string): Promise<CommandResult> {
  const child = spawn(command, [...args], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === null) {
        reject(new Error(`${command} ${args.join(' ')} exited from signal ${signal ?? 'unknown'}.`));
        return;
      }
      resolve(code);
    });
  });

  return { exitCode, stdout, stderr };
}

function formatCommandFailure(command: string, args: readonly string[], result: CommandResult): string {
  return [
    `${command} ${args.join(' ')} exited ${result.exitCode.toString()}.`,
    result.stdout.trim().length > 0 ? `stdout:\n${result.stdout}` : 'stdout: <empty>',
    result.stderr.trim().length > 0 ? `stderr:\n${result.stderr}` : 'stderr: <empty>',
  ].join('\n');
}

function parseJsonCandidate(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseNpmPackJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  assert(trimmed.length > 0, 'npm pack --json produced empty stdout.');

  const direct = parseJsonCandidate(trimmed);
  if (direct !== null) {
    return direct;
  }

  const candidates: string[] = [];
  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  throw new Error(
    [
      'Unable to parse JSON from npm pack --dry-run --ignore-scripts --json output.',
      'stdout:',
      trimmed,
    ].join('\n')
  );
}

function toPackResults(parsed: unknown): Record<string, unknown>[] {
  const results = Array.isArray(parsed) ? parsed : [parsed];
  assert(results.length > 0, 'npm pack --json returned no package results.');

  return results.map((result, index) => {
    assert(isRecord(result), `npm pack result at index ${index.toString()} was not an object.`);
    return result;
  });
}

function normalizePackagePath(path: string): string {
  let normalized = path.replaceAll('\\', '/');
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  if (normalized.startsWith('package/')) {
    normalized = normalized.slice('package/'.length);
  }
  return normalized;
}

function collectPackedFilePaths(packResults: readonly Record<string, unknown>[]): Set<string> {
  const paths = new Set<string>();

  for (const [resultIndex, result] of packResults.entries()) {
    const files = result.files;
    assert(Array.isArray(files), `npm pack result at index ${resultIndex.toString()} did not include a files array.`);

    for (const [fileIndex, file] of files.entries()) {
      assert(
        isRecord(file),
        `npm pack file entry at result ${resultIndex.toString()}, file ${fileIndex.toString()} was not an object.`
      );
      if (typeof file.path === 'string' && file.path.length > 0) {
        paths.add(normalizePackagePath(file.path));
      }
    }
  }

  assert(paths.size > 0, 'npm pack --json returned no file paths.');
  return paths;
}

function describePackResults(packResults: readonly Record<string, unknown>[]): string {
  return packResults
    .map((result, index) => {
      const filename = typeof result.filename === 'string' ? result.filename : `result ${index.toString()}`;
      const entryCount = typeof result.entryCount === 'number' ? `, ${result.entryCount.toString()} entries` : '';
      return `${filename}${entryCount}`;
    })
    .join('; ');
}

async function main(): Promise<void> {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const args = ['pack', '--dry-run', '--ignore-scripts', '--json', '--registry=https://registry.npmjs.org'] as const;
  const result = await run('npm', args, repoRoot);

  if (result.exitCode !== 0) {
    throw new Error(formatCommandFailure('npm', args, result));
  }

  const packResults = toPackResults(parseNpmPackJson(result.stdout));
  const packedFiles = collectPackedFilePaths(packResults);
  const missingFiles = requiredPackageFiles.filter((path) => !packedFiles.has(path));

  if (missingFiles.length > 0) {
    const relatedFiles = [...packedFiles]
      .filter((path) => path === 'package.json' || path === 'examples.json' || path.startsWith('dist/'))
      .sort();

    throw new Error(
      [
        'Package contents assertion failed: npm pack did not include required published artifacts.',
        '',
        'Missing required files:',
        ...missingFiles.map((path) => `- ${path}`),
        '',
        'This check intentionally runs `npm pack --dry-run --ignore-scripts --json` so `prepack` cannot rebuild missing output.',
        'Run `bun run build` first and ensure package.json#files includes the built artifacts.',
        '',
        relatedFiles.length > 0 ? 'Related files that were included:' : 'No related dist/package files were included.',
        ...relatedFiles.map((path) => `- ${path}`),
      ].join('\n')
    );
  }

  console.log(
    [
      `Package contents assertion passed for ${describePackResults(packResults)}.`,
      `Verified required files: ${requiredPackageFiles.join(', ')}.`,
    ].join('\n')
  );
}

await main();
