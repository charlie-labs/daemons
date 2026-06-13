import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type RunOptions = {
  cwd: string;
  env: Record<string, string>;
  expectedExitCode?: number;
};

const safeEnvKeys = [
  'BUN_INSTALL_CACHE_DIR',
  'CI',
  'COMSPEC',
  'HOME',
  'NPM_CONFIG_REGISTRY',
  'PATH',
  'SHELL',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
] as const;

const validDaemonFixture = `---
id: smoke-daemon
purpose: Validate the packaged daemon binary.
watch:
  - when smoke tests run
routines:
  - report that the packaged binary executed
deny:
  - do not access external services
schedule: "0 9 * * 1-5"
---

# Smoke daemon

This fixture exists only to verify the packaged CLI validates local daemon files.
`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(text: string, description: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  assert(isRecord(parsed), `${description} did not produce a JSON object.`);
  return parsed;
}

function baseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of safeEnvKeys) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.NO_COLOR = '1';
  return env;
}

function withPathPrefix(env: Record<string, string>, pathPrefix: string): Record<string, string> {
  return {
    ...env,
    PATH: `${pathPrefix}${delimiter}${env.PATH ?? ''}`,
  };
}

async function run(command: string, args: readonly string[], options: RunOptions): Promise<CommandResult> {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env,
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

  const expectedExitCode = options.expectedExitCode ?? 0;
  if (exitCode !== expectedExitCode) {
    throw new Error(
      [
        `${command} ${args.join(' ')} exited ${exitCode.toString()}, expected ${expectedExitCode.toString()}.`,
        stdout.trim().length > 0 ? `stdout:\n${stdout}` : 'stdout: <empty>',
        stderr.trim().length > 0 ? `stderr:\n${stderr}` : 'stderr: <empty>',
      ].join('\n')
    );
  }

  return { exitCode, stdout, stderr };
}

async function main(): Promise<void> {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const packageJsonPath = join(repoRoot, 'package.json');
  const packageJson = parseJsonObject(await readFile(packageJsonPath, 'utf8'), 'package.json');
  const version = packageJson.version;
  const bin = packageJson.bin;
  const packageExports = packageJson.exports;

  assert(typeof version === 'string' && version.length > 0, 'package.json#version must be a non-empty string.');
  assert(isRecord(bin) && bin.daemon === './dist/bin.js', 'package.json#bin.daemon must point at ./dist/bin.js.');
  assert(packageJson.main === './dist/index.js', 'package.json#main must point at ./dist/index.js.');
  assert(packageJson.types === './dist/index.d.ts', 'package.json#types must point at ./dist/index.d.ts.');
  assert(isRecord(packageExports) && isRecord(packageExports['.']), 'package.json#exports must expose the package root.');
  assert(isRecord(packageExports) && isRecord(packageExports['./examples']), 'package.json#exports must expose ./examples.');

  const distBinPath = join(repoRoot, 'dist', 'bin.js');
  const distBinStat = await stat(distBinPath).catch(() => null);
  assert(distBinStat !== null && distBinStat.isFile(), 'dist/bin.js is missing. Run `bun run build` before `bun run smoke:daemon`.');
  assert((distBinStat.mode & 0o111) !== 0, 'dist/bin.js is not executable.');

  const tempRoot = await mkdtemp(join(tmpdir(), 'daemon-bin-smoke-'));
  try {
    const env = baseEnv();
    const packDir = join(tempRoot, 'pack');
    const consumerDir = join(tempRoot, 'consumer');
    await mkdir(packDir, { recursive: true });
    await mkdir(consumerDir, { recursive: true });

    await run('bun', ['pm', 'pack', '--ignore-scripts', '--destination', packDir, '--quiet'], {
      cwd: repoRoot,
      env,
    });

    const tarballs = (await readdir(packDir)).filter((name) => name.endsWith('.tgz'));
    const tarballName = tarballs[0];
    assert(tarballName !== undefined && tarballs.length === 1, `Expected one packed tarball, found ${tarballs.length.toString()}.`);
    const tarballPath = join(packDir, tarballName);

    await writeFile(
      join(consumerDir, 'package.json'),
      `${JSON.stringify(
        {
          private: true,
          type: 'module',
          dependencies: {
            '@charlie-labs/daemons': `file:${tarballPath}`,
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    await run('bun', ['install', '--offline', '--no-progress'], {
      cwd: consumerDir,
      env,
    });

    const installedPackageJson = parseJsonObject(
      await readFile(join(consumerDir, 'node_modules', '@charlie-labs', 'daemons', 'package.json'), 'utf8'),
      'installed package.json'
    );
    const installedBin = installedPackageJson.bin;
    const installedExports = installedPackageJson.exports;
    assert(isRecord(installedBin) && installedBin.daemon === './dist/bin.js', 'Installed package is missing the daemon bin mapping.');
    assert(installedPackageJson.main === './dist/index.js', 'Installed package is missing the root main entry.');
    assert(installedPackageJson.types === './dist/index.d.ts', 'Installed package is missing the root types entry.');
    assert(isRecord(installedExports) && isRecord(installedExports['.']), 'Installed package is missing the root export.');
    assert(isRecord(installedExports) && isRecord(installedExports['./examples']), 'Installed package is missing the ./examples export.');

    const installedBinDir = join(consumerDir, 'node_modules', '.bin');
    const daemonCommand = process.platform === 'win32' ? 'daemon.cmd' : 'daemon';
    const installedBinPath = join(installedBinDir, daemonCommand);
    const installedBinStat = await stat(installedBinPath).catch(() => null);
    assert(installedBinStat !== null, `Installed package did not create ${installedBinPath}.`);

    const installedPackageRoot = join(consumerDir, 'node_modules', '@charlie-labs', 'daemons');
    const installedDistBinPath = join(installedPackageRoot, 'dist', 'bin.js');
    const installedDistBinStat = await stat(installedDistBinPath).catch(() => null);
    assert(installedDistBinStat !== null && installedDistBinStat.isFile(), 'Installed package is missing dist/bin.js.');
    if (process.platform !== 'win32') {
      assert((installedDistBinStat.mode & 0o111) !== 0, 'Installed dist/bin.js is not executable.');
    }

    const installedDistIndexPath = join(installedPackageRoot, 'dist', 'index.js');
    const installedDistTypesPath = join(installedPackageRoot, 'dist', 'index.d.ts');
    const installedExamplesPath = join(installedPackageRoot, 'examples.json');
    assert((await stat(installedDistIndexPath).catch(() => null))?.isFile() === true, 'Installed package is missing dist/index.js.');
    assert((await stat(installedDistTypesPath).catch(() => null))?.isFile() === true, 'Installed package is missing dist/index.d.ts.');
    assert((await stat(installedExamplesPath).catch(() => null))?.isFile() === true, 'Installed package is missing examples.json.');

    const cliEnv = withPathPrefix(env, installedBinDir);

    const importResult = await run('node', [
      '--input-type=module',
      '--eval',
      `import {
  createDaemonInstallPlan,
  getDaemonExample,
  listDaemonExamples,
  loadDaemonExamplesCatalog,
} from '@charlie-labs/daemons';
const catalog = await loadDaemonExamplesCatalog();
if (catalog.schemaVersion !== 1 || catalog.examples.length === 0) throw new Error('catalog did not load');
const examples = await listDaemonExamples();
const example = await getDaemonExample(examples[0].id);
if (!example || example.id !== examples[0].id) throw new Error('getDaemonExample did not return the first example');
const subpath = await import('@charlie-labs/daemons/examples');
const subpathExamples = await subpath.listDaemonExamples();
if (subpathExamples.length !== examples.length) throw new Error('./examples export returned a different catalog');
const planResult = createDaemonInstallPlan({ entry: example, installRoot: process.cwd() });
if (!planResult.ok) throw new Error('install planner rejected a packaged example');
if (!planResult.plan.files.some((file) => file.mode === '100644')) throw new Error('install plan is missing 100644 modes');
console.log('package import smoke loaded ' + examples.length + ' examples');`,
    ], {
      cwd: consumerDir,
      env: cliEnv,
    });
    assert(importResult.stdout.includes('package import smoke loaded'), 'Package import smoke did not print its success marker.');

    const versionResult = await run(daemonCommand, ['--version'], {
      cwd: consumerDir,
      env: cliEnv,
    });
    assert(versionResult.stdout.trim() === version, `Expected daemon --version to print ${version}, got ${versionResult.stdout.trim()}.`);
    assert(versionResult.stderr.trim() === '', 'daemon --version wrote to stderr.');

    const rootHelpResult = await run(daemonCommand, ['--help'], {
      cwd: consumerDir,
      env: cliEnv,
    });
    assert(rootHelpResult.stdout.includes('daemon - Charlie daemon catalog CLI'), 'daemon --help did not print root help.');
    assert(rootHelpResult.stdout.includes('daemon validate <path>'), 'daemon --help did not include validate usage.');

    const showHelpJsonResult = await run(daemonCommand, ['show', '--help', '--json'], {
      cwd: consumerDir,
      env: cliEnv,
    });
    const showHelpJson = parseJsonObject(showHelpJsonResult.stdout, 'daemon show --help --json');
    assert(showHelpJson.command === 'help' && showHelpJson.ok === true, 'daemon show --help --json returned an unexpected envelope.');
    assert(isRecord(showHelpJson.data) && showHelpJson.data.topic === 'show', 'daemon show --help --json did not return show help data.');
    assert(typeof showHelpJson.data.text === 'string' && showHelpJson.data.text.includes('Usage: daemon show'), 'daemon show --help --json did not include show usage text.');

    const daemonDir = join(consumerDir, '.agents', 'daemons', 'smoke-daemon');
    await mkdir(daemonDir, { recursive: true });
    await writeFile(join(daemonDir, 'DAEMON.md'), validDaemonFixture, 'utf8');

    const validateJsonResult = await run(daemonCommand, ['validate', '.agents/daemons/smoke-daemon/DAEMON.md', '--json'], {
      cwd: consumerDir,
      env: cliEnv,
    });
    const validateJson = parseJsonObject(validateJsonResult.stdout, 'daemon validate --json');
    assert(validateJson.command === 'validate' && validateJson.ok === true, 'daemon validate --json returned an unexpected envelope.');
    assert(isRecord(validateJson.data), 'daemon validate --json did not include data.');
    assert(validateJson.data.fileCount === 1 && validateJson.data.validCount === 1, 'daemon validate --json did not validate exactly one fixture.');

    const validateAllJsonResult = await run(daemonCommand, ['validate', '--all', '--json'], {
      cwd: consumerDir,
      env: cliEnv,
    });
    const validateAllJson = parseJsonObject(validateAllJsonResult.stdout, 'daemon validate --all --json');
    assert(validateAllJson.command === 'validate' && validateAllJson.ok === true, 'daemon validate --all --json returned an unexpected envelope.');
    assert(isRecord(validateAllJson.data), 'daemon validate --all --json did not include data.');
    assert(validateAllJson.data.fileCount === 1 && validateAllJson.data.validCount === 1, 'daemon validate --all --json did not discover exactly one fixture.');

    console.log('daemon binary smoke tests passed');
    console.log('- packed package tarball and installed it into a temp consumer project');
    console.log('- invoked the CLI as `daemon` via node_modules/.bin');
    console.log('- verified version, help, show help JSON, and validate JSON commands');
    console.log('- imported the package API, loaded examples.json, showed an example, and created an install plan');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
