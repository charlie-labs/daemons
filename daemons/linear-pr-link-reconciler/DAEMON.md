---
id: linear-pr-link-reconciler
purpose: Keep Linear issue discussions connected to likely GitHub code work by suggesting candidate links for human confirmation.
watch:
  - A Linear issue is created mentioning active GitHub code work or missing pull request linkage.
  - A Linear issue comment is added mentioning active GitHub code work or missing pull request linkage.
routines:
  - Decide whether the triggering issue or comment mentions active code work that may belong to GitHub.
  - Search likely related GitHub pull requests, branches, and commits using issue identity, explicit URLs, title terms, and branch names.
  - Post a Linear comment with candidate links or a confirmation ask when confidence is useful but automatic linking would be unsafe.
deny:
  - Do not edit Linear issue links, relations, state, labels, assignee, priority, project, cycle, estimate, due date, title, or description.
  - Do not edit GitHub pull request titles, bodies, labels, assignees, reviewers, branches, commits, issues, or comments.
  - Do not infer a repository when Linear team mapping is missing or ambiguous.
  - Do not post candidate links when issue identity or candidate confidence is ambiguous.
  - Do not require a custom branch naming convention to find candidates.
  - Do not repeat an equivalent candidate-link comment for unchanged evidence.
---

# Linear PR Link Reconciler

## Code-work signals

The watch conditions are intended for Linear issue activity that already mentions active code work or missing GitHub linkage.

In-scope signals include:

- an explicit GitHub pull request, branch, commit, comparison, or repository URL
- the Linear issue ID appearing near language such as PR, branch, commit, fix, implementation, landed, shipping, in review, or code change
- a comment asking where the PR is, whether a fix exists, or whether work is already linked
- issue title/body terms that strongly match an active branch or pull request in the mapped repository

No-op when the issue or comment is only planning, prioritization, product discussion, status chatter, or a support note without active code-work evidence.

## Repository and identity policy

Use the repository inferred from the Linear team mapping by default. Fail closed when:

- the Linear issue ID is unavailable
- no mapped repository is available
- more than one mapped repository could own the work and the trigger does not disambiguate
- the trigger references a repository outside the mapping without enough evidence to trust it

When the repository is ambiguous, do not search broadly and do not comment with guesses.

## Matching policy

Search active GitHub work first, then historical evidence:

1. Pull requests where the title, body, branch name, commits, or linked metadata mention the Linear issue ID.
2. Explicit GitHub URLs in the Linear issue or comments.
3. Branch names that include the issue ID or distinctive issue-title terms.
4. Commits that mention the issue ID or distinctive title terms.
5. Pull requests whose title/body terms strongly match the Linear issue title and affected area.

A custom branch convention is not required. Use branch names as one evidence source, not as a prerequisite.

Prefer open PRs and recently updated branches or commits. Include closed or merged PRs only when they clearly explain current status.

## Output policy

Prefer Linear comments over automatic link edits.

Post a comment only when it reduces uncertainty. Use one of these shapes:

```md
Likely related GitHub work

- <candidate link> — <why it matches>

I did not edit links automatically. Please confirm whether this should be treated as the code work for this Linear issue.
```

```md
Possible GitHub matches

1. <candidate link> — <evidence and uncertainty>
2. <candidate link> — <evidence and uncertainty>

Which one, if any, should be linked to this Linear issue?
```

Use a confirmation ask when multiple candidates are plausible. No-op when all candidates are weak.

## Idempotency

Before commenting, inspect existing Charlie comments on the issue. If the same candidates were already suggested for the same trigger evidence, no-op.

Do not post on every comment in an ongoing thread. Post only when new evidence materially changes the candidate set or human confirmation is newly needed.

## No-op when

- the trigger does not mention active code work
- issue identity, repository mapping, or GitHub access is unavailable
- candidate confidence is low or ambiguous
- a matching link is already clearly present in the Linear issue context
- an equivalent Charlie candidate-link comment already exists
