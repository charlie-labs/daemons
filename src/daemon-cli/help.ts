export function getRootHelpText(): string {
  return `daemon - Charlie daemon catalog CLI

Usage:
  daemon list [--ref <sha|branch|tag>] [--json]
  daemon show <example-id> [--ref <sha|branch|tag>] [--json]
  daemon add <example-id> [--ref <sha|branch|tag>] [--adapt key=value] [--adapt-file adaptations.json] [--dry-run] [--force] [--allow-deprecated] [--json]
  daemon install <example-id> [same flags as add]
  daemon validate <path> [--dry-run] [--json]
  daemon validate --all [--dry-run] [--json]

Exit codes:
  0   success
  64  usage error
  65  validation or catalog/data error
  70  internal or I/O error`;
}

export function getCommandHelpText(command: string): string {
  if (command === 'list') {
    return 'Usage: daemon list [--ref <sha|branch|tag>] [--json]\n\nReads root examples.json and lists catalog example IDs.';
  }

  if (command === 'show') {
    return 'Usage: daemon show <example-id> [--ref <sha|branch|tag>] [--json]\n\nShows catalog metadata, support files, integrations, and required adaptations.';
  }

  if (command === 'add') {
    return 'Usage: daemon add <example-id> [--ref <sha|branch|tag>] [--adapt key=value] [--adapt-file adaptations.json] [--dry-run] [--force] [--allow-deprecated] [--json]\n\nScaffolds catalog-listed files into .agents/daemons/<id>/ without activating the daemon. Adaptation values render documented {{adapt.key}} tokens before validation and writes.';
  }

  if (command === 'validate') {
    return 'Usage: daemon validate <path> [--dry-run] [--json]\n       daemon validate --all [--dry-run] [--json]\n\nStrictly validates runtime DAEMON.md frontmatter and body.';
  }

  return getRootHelpText();
}
