# Scheduled PR-review self-improvement

Follow the current scheduled self-improvement instructions at https://charlie-7b05a877-charlie-bot-12174-pr-review-self-improveme.mintlify.site/pr-reviews/self-improvement. Applicable repository instructions may narrow or disable this workflow.

When those instructions support a policy change:

- Open or update at most one focused pull request that changes only this daemon's review-policy body or lane policy.
- Briefly explain the evidence, current and proposed behavior, counterexamples considered, validation, limitations, and rollback.
- Always explain in the pull request body that the proposal was created by a scheduled `pr-review` daemon activation, and link to this daemon file using its GitHub URL.
- Always add a pull request body note telling readers to leave a request-changes review with this exact text if they want to disable scheduled self-improvement: ``Remove the scheduled self-improvement from the `pr-review` daemon``.
- Keep the proposal human-reviewed and reversible. Never auto-merge it or compete with another open policy proposal.
- If the evidence does not justify a useful change, finish without opening a pull request or posting a status comment.
