export function getRootHelpText(): string {
  return `daemon - Charlie daemon catalog CLI

Usage:
  daemon list [--ref <sha|branch|tag>] [--json]
  daemon show <example-id> [--ref <sha|branch|tag>] [--json]
  daemon add <example-id> [--ref <sha|branch|tag>] [--adapt key=value] [--adapt-file adaptations.json] [--dry-run] [--force] [--allow-deprecated] [--json]
  daemon install <example-id> [same flags as add]
  daemon pr open <example-id> --repo owner/repo [--ref <sha|branch|tag>] [--base <branch>] [--adapt key=value] [--adapt-file adaptations.json] [--force] [--json]
  daemon pr list --repo owner/repo [--json]
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
    return 'Usage: daemon list [--ref <sha|branch|tag>] [--json]\n\nLists first-party examples and approved external daemon slugs. --ref pins only the first-party catalog; approved external commits are registry-pinned.';
  }

  if (command === 'show') {
    return 'Usage: daemon show <example-id> [--ref <sha|branch|tag>] [--json]\n\nShows catalog metadata and provenance. Approved external entries include their repository, pinned commit, integrations, and complete reviewed file plan.';
  }

  if (command === 'add') {
    return 'Usage: daemon add <example-id> [--ref <sha|branch|tag>] [--adapt key=value] [--adapt-file adaptations.json] [--dry-run] [--force] [--allow-deprecated] [--json]\n\nScaffolds catalog-listed files into .agents/daemons/<id>/ without activating the daemon. Approved external installs use only registry-reviewed files at their pinned commit and do not accept adaptations.';
  }

  if (command === 'pr') {
    return 'Usage: daemon pr <open|list> [--json]\n\nOpens and lists daemon install pull requests in a target GitHub repository.';
  }

  if (command === 'pr open') {
    return 'Usage: daemon pr open <example-id> --repo owner/repo [--ref <sha|branch|tag>] [--base <branch>] [--adapt key=value] [--adapt-file adaptations.json] [--force] [--json]\n\nOpens an idempotent install PR from a deterministic charlie/daemon-installs/<example-id> branch. Approved external installs include pinned source and reviewed-file provenance in the PR body and v2 marker.';
  }

  if (command === 'pr list') {
    return 'Usage: daemon pr list --repo owner/repo [--json]\n\nLists daemon install pull requests by hidden marker and reconciles deterministic charlie/daemon-installs/* branches.';
  }

  if (command === 'validate') {
    return 'Usage: daemon validate <path> [--dry-run] [--json]\n       daemon validate --all [--dry-run] [--json]\n\nStrictly validates runtime DAEMON.md frontmatter and body.';
  }

  return getRootHelpText();
}
