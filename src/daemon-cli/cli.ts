import { createGitHubCatalogClient } from './catalog-client';
import { commandAliases, DAEMON_CLI_VERSION, EXIT_CODE_SUCCESS, EXIT_CODE_USAGE } from './constants';
import { getCommandHelpText, getRootHelpText } from './help';
import { issue } from './issues';
import { runAddCommand, runListCommand, runPrCommand, runShowCommand, runValidateCommand } from './commands';
import type { CatalogClient, CliCommandResult, HelpData, VersionData } from './types';
import type { DaemonInstallPrGitHubClient } from '../daemon-install-pr';

export type CliOutput = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd?: string;
};

type GlobalFlags = {
  json: boolean;
  help: boolean;
  version: boolean;
};

function parseGlobalFlags(argv: readonly string[]): { flags: GlobalFlags; remaining: string[] } {
  const flags: GlobalFlags = { json: false, help: false, version: false };
  const remaining: string[] = [];

  for (const token of argv) {
    if (token === '--json') {
      flags.json = true;
    } else if (token === '--help' || token === '-h') {
      flags.help = true;
    } else if (token === '--version') {
      flags.version = true;
    } else {
      remaining.push(token);
    }
  }

  return { flags, remaining };
}

function resolveCommand(commandToken: string): 'list' | 'show' | 'add' | 'validate' | 'pr' | null {
  if (commandToken === 'list') return commandAliases.list;
  if (commandToken === 'show') return commandAliases.show;
  if (commandToken === 'add') return commandAliases.add;
  if (commandToken === 'install') return commandAliases.install;
  if (commandToken === 'validate') return commandAliases.validate;
  if (commandToken === 'pr') return 'pr';
  return null;
}

function usageResult(summary: string): CliCommandResult<HelpData> {
  return {
    command: 'help',
    ok: false,
    exitCode: EXIT_CODE_USAGE,
    summary,
    warnings: [],
    errors: [issue({ code: 'USAGE_ERROR', message: summary })],
    data: { topic: 'root', text: getRootHelpText() },
  };
}

function versionResult(): CliCommandResult<VersionData> {
  return {
    command: 'version',
    ok: true,
    exitCode: EXIT_CODE_SUCCESS,
    summary: `daemon version ${DAEMON_CLI_VERSION}`,
    warnings: [],
    errors: [],
    data: { version: DAEMON_CLI_VERSION },
  };
}

function helpResult(topic: string): CliCommandResult<HelpData> {
  return {
    command: 'help',
    ok: true,
    exitCode: EXIT_CODE_SUCCESS,
    summary: `Showing help for ${topic}.`,
    warnings: [],
    errors: [],
    data: { topic, text: topic === 'root' ? getRootHelpText() : getCommandHelpText(topic) },
  };
}

async function runCommand(args: {
  argv: readonly string[];
  cwd: string;
  catalogClient: CatalogClient;
  githubClient?: DaemonInstallPrGitHubClient | undefined;
}): Promise<{ flags: GlobalFlags; result: CliCommandResult }> {
  const parsed = parseGlobalFlags(args.argv);

  if (parsed.flags.version) {
    return { flags: parsed.flags, result: versionResult() };
  }

  const commandToken = parsed.remaining[0];
  if (parsed.flags.help) {
    if (!commandToken) {
      return { flags: parsed.flags, result: helpResult('root') };
    }
    const resolved = resolveCommand(commandToken);
    if (!resolved) {
      return { flags: parsed.flags, result: usageResult(`Unknown command '${commandToken}'.`) };
    }
    if (resolved === 'pr') {
      const subcommand = parsed.remaining[1];
      if (subcommand === 'open' || subcommand === 'list') {
        return { flags: parsed.flags, result: helpResult(`pr ${subcommand}`) };
      }
      return { flags: parsed.flags, result: helpResult('pr') };
    }
    return { flags: parsed.flags, result: helpResult(commandToken === 'install' ? 'add' : resolved) };
  }

  if (!commandToken) {
    return { flags: parsed.flags, result: usageResult('Missing command. Use --help for usage.') };
  }

  const resolved = resolveCommand(commandToken);
  if (!resolved) {
    return { flags: parsed.flags, result: usageResult(`Unknown command '${commandToken}'.`) };
  }

  const commandArgs = parsed.remaining.slice(1);
  if (resolved === 'list') {
    return { flags: parsed.flags, result: await runListCommand({ commandArgs, catalogClient: args.catalogClient }) };
  }
  if (resolved === 'show') {
    return { flags: parsed.flags, result: await runShowCommand({ commandArgs, catalogClient: args.catalogClient }) };
  }
  if (resolved === 'add') {
    return {
      flags: parsed.flags,
      result: await runAddCommand({
        commandName: commandToken === 'install' ? 'install' : 'add',
        commandArgs,
        cwd: args.cwd,
        catalogClient: args.catalogClient,
      }),
    };
  }

  if (resolved === 'pr') {
    return { flags: parsed.flags, result: await runPrCommand({ commandArgs, cwd: args.cwd, catalogClient: args.catalogClient, githubClient: args.githubClient }) };
  }

  return { flags: parsed.flags, result: await runValidateCommand({ commandArgs, cwd: args.cwd }) };
}

function isHelpData(data: unknown): data is HelpData {
  return typeof data === 'object' && data !== null && 'text' in data && 'topic' in data;
}

function formatHumanResult(result: CliCommandResult, verbose: boolean): string {
  if (result.command === 'help' && isHelpData(result.data) && result.ok) {
    return result.data.text;
  }

  if (result.command === 'version' && result.data && typeof result.data === 'object' && 'version' in result.data) {
    return String(result.data.version);
  }

  const lines: string[] = [result.summary];
  const data = result.data as Record<string, unknown> | null;

  if (result.command === 'list' && data) {
    lines.push(`Source: ${String(data.sourceRepo)}@${String(data.sourceRef)}`);
    const examples = Array.isArray(data.examples) ? data.examples : [];
    lines.push('Available daemon examples:');
    for (const example of examples) {
      if (typeof example === 'object' && example !== null && 'id' in example) {
        const record = example as Record<string, unknown>;
        lines.push(`- ${String(record.id)} (${String(record.status)}, ${String(record.readiness)})`);
      }
    }
  }

  if (result.command === 'show' && data) {
    lines.push(`Status: ${String(data.status)}`);
    lines.push(`Readiness: ${String(data.readiness)}`);
    lines.push(`Required integrations: ${Array.isArray(data.requiredIntegrations) && data.requiredIntegrations.length > 0 ? data.requiredIntegrations.join(', ') : 'none'}`);
    lines.push(`Optional integrations: ${Array.isArray(data.optionalIntegrations) && data.optionalIntegrations.length > 0 ? data.optionalIntegrations.join(', ') : 'none'}`);
    lines.push(`Support files: ${[...(Array.isArray(data.scripts) ? data.scripts : []), ...(Array.isArray(data.references) ? data.references : [])].length.toString()}`);
    const structuredAdaptations = Array.isArray(data.adaptations) ? data.adaptations : [];
    if (structuredAdaptations.length > 0) {
      lines.push('Adaptation inputs:');
      for (const adaptation of structuredAdaptations) {
        if (typeof adaptation === 'object' && adaptation !== null && 'key' in adaptation) {
          const record = adaptation as Record<string, unknown>;
          lines.push(`- ${String(record.key)} (${record.required === true ? 'required' : 'optional'}): ${String(record.label)}`);
        }
      }
    }
    const specializationIdeas = Array.isArray(data.specializationIdeas) ? data.specializationIdeas : [];
    if (specializationIdeas.length > 0) {
      lines.push('Specialization ideas:');
      for (const specializationIdea of specializationIdeas) lines.push(`- ${String(specializationIdea)}`);
    }
    lines.push(`Activation: ${String(data.activationRequired)}`);
  }

  if ((result.command === 'add' || result.command === 'install') && data) {
    lines.push(`Directory: ${String(data.filePath)}`);
    lines.push(`Source: ${String(data.sourceRepo)}@${String(data.sourceRef)}`);
    lines.push(`Files planned: ${String(data.fileCount)}`);
    lines.push(`Dry run: ${data.dryRun === true ? 'yes' : 'no'}`);
    lines.push(`Overwritten: ${data.overwritten === true ? 'yes' : 'no'}`);
    const appliedKeys = Array.isArray(data.adaptationsApplied) ? data.adaptationsApplied : [];
    lines.push('Adaptation keys applied:');
    if (appliedKeys.length === 0) {
      lines.push('- none');
    } else {
      for (const key of appliedKeys) lines.push(`- ${String(key)}`);
    }
    lines.push(`Activation: ${String(data.activationRequired)}`);
  }

  if (result.command === 'pr open' && data) {
    lines.push(`Repository: ${String(data.repository)}`);
    lines.push(`Base: ${String(data.baseBranch)}`);
    lines.push(`Branch: ${String(data.headBranch)}`);
    lines.push(`Head SHA: ${String(data.headSha)}`);
    const pullRequest = data.pullRequest as Record<string, unknown> | undefined;
    if (pullRequest) lines.push(`Pull request: #${String(pullRequest.number)} ${String(pullRequest.url)}`);
    const appliedKeys = Array.isArray(data.adaptationsApplied) ? data.adaptationsApplied : [];
    lines.push(`Adaptation keys applied: ${appliedKeys.length > 0 ? appliedKeys.map(String).join(', ') : 'none'}`);
  }

  if (result.command === 'pr list' && data) {
    lines.push(`Repository: ${String(data.repository)}`);
    lines.push(`Branch prefix: ${String(data.branchPrefix)}`);
    const listings = Array.isArray(data.installPullRequests) ? data.installPullRequests : [];
    for (const listing of listings) {
      if (typeof listing === 'object' && listing !== null) {
        const record = listing as Record<string, unknown>;
        const pullRequest = record.pullRequest as Record<string, unknown> | null;
        const label = pullRequest ? `#${String(pullRequest.number)}` : String(record.headBranch);
        lines.push(`- ${label}: ${String(record.status)}`);
      }
    }
  }

  if (result.command === 'validate' && data) {
    const files = Array.isArray(data.files) ? data.files : [];
    for (const file of files) {
      if (typeof file === 'object' && file !== null && 'filePath' in file && 'ok' in file) {
        const record = file as Record<string, unknown>;
        lines.push(`- ${String(record.filePath)}: ${record.ok === true ? 'valid' : 'invalid'}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.length.toString()}`);
    for (const warning of verbose ? result.warnings : result.warnings.slice(0, 3)) {
      lines.push(`- [${warning.code}] ${warning.message}`);
    }
    if (!verbose && result.warnings.length > 3) {
      lines.push('- Use --verbose to see all warnings.');
    }
  }

  if (result.errors.length > 0) {
    lines.push(`Errors: ${result.errors.length.toString()}`);
    for (const error of result.errors) {
      lines.push(`- [${error.code}] ${error.message}`);
    }
    if (result.command === 'help' && isHelpData(result.data)) {
      lines.push('', result.data.text);
    }
  }

  return lines.join('\n');
}

function formatJsonResult(result: CliCommandResult): string {
  return JSON.stringify(
    {
      command: result.command,
      ok: result.ok,
      exitCode: result.exitCode,
      summary: result.summary,
      warnings: result.warnings,
      errors: result.errors,
      data: result.data,
    },
    null,
    2
  );
}

export async function executeCli(args: {
  argv: readonly string[];
  output?: CliOutput;
  catalogClient?: CatalogClient;
  githubClient?: DaemonInstallPrGitHubClient | undefined;
}): Promise<number> {
  const stdout = args.output?.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = args.output?.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
  const cwd = args.output?.cwd ?? process.cwd();
  const catalogClient = args.catalogClient ?? createGitHubCatalogClient();

  const run = await runCommand({ argv: args.argv, cwd, catalogClient, githubClient: args.githubClient });
  const rendered = run.flags.json ? formatJsonResult(run.result) : formatHumanResult(run.result, false);

  if (run.flags.json || run.result.ok) {
    stdout(rendered);
  } else {
    stderr(rendered);
  }

  return run.result.exitCode;
}
