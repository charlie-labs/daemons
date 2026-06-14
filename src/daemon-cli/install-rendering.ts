import { expectedDaemonIdFromPath, toDisplayPath } from './fs-utils';
import { knownAdaptationKeys, renderAdaptationTokens, type AdaptationResolution } from './adaptations';
import { issue } from './issues';
import type { CatalogClient, CliIssue, InstallFilePlan } from './types';
import { validateRuntimeDaemonMarkdown } from './validation/runtime';
import type { CatalogExample } from '../examples/types';

export type RenderedDaemonInstallFile = InstallFilePlan & {
  content: string;
};

export async function prepareDaemonInstallFiles(args: {
  entry: CatalogExample;
  ref: string;
  catalogClient: CatalogClient;
  installRoot: string;
  files: readonly InstallFilePlan[];
  resolution: AdaptationResolution;
}): Promise<{ ok: true; files: RenderedDaemonInstallFile[] } | { ok: false; errors: CliIssue[] }> {
  const renderedFiles: RenderedDaemonInstallFile[] = [];
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
