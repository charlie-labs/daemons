import { spawnSync } from "node:child_process";

const USAGE =
  "Usage: bun .agents/daemons/pr-review-triage/scripts/bootstrap-data.ts [--repo <owner/repo>] --pr <number>";

const HELP_TEXT = `Bootstrap baseline data for the pr-review-triage daemon.

${USAGE}

Options:
  --repo <owner/repo>   Optional repository identity. Defaults to the current GitHub repository.
  --pr <number>         Required pull request number (positive integer).
  -h, --help            Show this help text.
`;

const GRAPHQL_QUERY = `
query PrReviewTriageBootstrap($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    nameWithOwner
    pullRequest(number: $prNumber) {
      id
      number
      title
      state
      isDraft
      merged
      url
      baseRefName
      baseRefOid
      headRefName
      headRefOid
      author {
        __typename
        login
      }
      authorAssociation
      reviews(first: 100) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          state
          submittedAt
          body
          url
          authorAssociation
          author {
            __typename
            login
          }
        }
      }
      reviewThreads(first: 100) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          isOutdated
          viewerCanResolve
          path
          line
          comments(first: 100) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              body
              createdAt
              updatedAt
              url
              authorAssociation
              isMinimized
              minimizedReason
              viewerCanMinimize
              viewerCanReact
              author {
                __typename
                login
              }
              reactionGroups {
                content
                viewerHasReacted
                users(first: 1) {
                  totalCount
                }
              }
            }
          }
        }
      }
      comments(first: 100) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          body
          createdAt
          updatedAt
          url
          authorAssociation
          isMinimized
          minimizedReason
          viewerCanMinimize
          viewerCanReact
          author {
            __typename
            login
          }
          reactionGroups {
            content
            viewerHasReacted
            users(first: 1) {
              totalCount
            }
          }
        }
      }
    }
  }
}
`;

interface CliArgs {
  repoOwner: string;
  repoName: string;
  prNumber: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let repoRaw: string | null = null;
  let prRaw: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--repo" || token === "--pr") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new TypeError(`Missing value for ${token}.\n${USAGE}`);
      }

      if (token === "--repo") {
        repoRaw = value;
      } else {
        prRaw = value;
      }

      index += 1;
      continue;
    }

    if (token === "-h" || token === "--help") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }

    throw new TypeError(`Unknown argument: ${token}\n${USAGE}`);
  }

  if (!repoRaw) {
    repoRaw = inferCurrentRepository();
  }

  if (!prRaw) {
    throw new TypeError(`--pr is required.\n${USAGE}`);
  }

  const [repoOwner, repoName, extra] = repoRaw.split("/");
  if (!repoOwner || !repoName || extra) {
    throw new TypeError(
      `Invalid --repo value: ${repoRaw}. Expected owner/repo.`,
    );
  }

  const prNumber = parseIntegerString(prRaw, "--pr");
  if (prNumber <= 0) {
    throw new RangeError(
      `Invalid --pr value: ${prRaw}. Expected a positive integer.`,
    );
  }

  return { repoOwner, repoName, prNumber };
}

function inferCurrentRepository(): string {
  const result = spawnSync(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );

  if (result.error) {
    throw new TypeError(
      `Failed to infer repository with gh repo view: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new TypeError(
      stderr && stderr.length > 0
        ? `Failed to infer repository with gh repo view: ${stderr}`
        : `Failed to infer repository with gh repo view; pass --repo <owner/repo>.`,
    );
  }

  const repo = result.stdout.trim();
  if (!repo) {
    throw new TypeError(
      `Failed to infer repository with gh repo view; pass --repo <owner/repo>.`,
    );
  }
  return repo;
}

function parseIntegerString(value: string, flag: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new RangeError(`${flag} must be an integer.`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new RangeError(`${flag} must be an integer.`);
  }

  return parsed;
}

function fetchBootstrapData(args: CliArgs): string {
  const result = spawnSync(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      `query=${GRAPHQL_QUERY}`,
      "-F",
      `owner=${args.repoOwner}`,
      "-F",
      `repo=${args.repoName}`,
      "-F",
      `prNumber=${args.prNumber}`,
    ],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw new TypeError(
      `Failed to run gh api graphql: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new TypeError(
      stderr && stderr.length > 0
        ? `gh api graphql failed: ${stderr}`
        : `gh api graphql failed with exit code ${String(result.status)}`,
    );
  }

  return result.stdout;
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const output = fetchBootstrapData(args);
    process.stdout.write(output);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown bootstrap-data error";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

main();
