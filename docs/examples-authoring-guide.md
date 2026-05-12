# Daemon examples authoring guide

Use this guide when picking, writing, editing, or reviewing public daemon examples. It is for example packages in this repo, not for normal customer-specific daemon files.

A public daemon example is a reusable starting point. It should teach a daemon shape that Charlie and humans can safely understand, copy, and adapt. It should not try to be universal, maximal, or clever at the expense of clarity.

## Package contract

The canonical package contract, customer copy semantics, support-file rules, and strict `example.yml` schema live in the [daemon examples v2 spec](./examples-spec.md).

This guide explains how to choose and author good examples within that spec. If this guide and the spec appear to conflict, the spec is authoritative for file shape, required fields, allowed keys, and validation rules.

## What makes a good public example

### Start from a JTBD

Choose examples because they help customers perform a durable job, not because they showcase an integration or clever automation idea.

Every example should map to at least one locked JTBD slug in `fit.jobsToBeDone`. If the customer job is unclear, the example is probably not ready for the public catalog.

Good examples usually help with recurring engineering work such as:

- keeping code and dependencies healthy
- keeping work and ownership organized
- keeping docs and durable knowledge current
- improving review quality
- fixing bounded implementation problems
- operating production systems
- maintaining explanatory context
- keeping planning surfaces accurate
- improving the daemon program itself

### Prefer recurring, bounded, reviewable work

The strongest examples have the core daemon qualities:

- The work recurs.
- The role is narrow enough to explain in one sentence.
- The daemon can wake from clear events, schedules, or both.
- The output lands on native surfaces where humans already review that work.
- Each activation can do a small amount of useful work.

Avoid examples where the role reads like "improve everything," where the output surface is unclear, or where almost every activation would require human judgment outside the daemon's policy.

### Minimize adaptation load when possible

Prefer examples with short `requirements.other` and short `adaptation.mustCustomize` lists. The easiest examples rely on common repo files, repo-local commands, GitHub-native workflows, and visible artifacts such as PRs, issues, comments, or reports.

This is a preference, not a hard rule. Some valuable examples need more setup. When an example requires many integrations, private conventions, production credentials, mature activation history, or complex workflow mapping, make that load explicit and consider whether it belongs outside dashboard onboarding.

### Include high-risk examples intentionally

High-risk examples are allowed when they show daemon leverage on real operational burden.

In this guide, high-risk does not mean "opens a PR touching important code." Reviewable artifacts such as PRs, draft docs, comments, and proposals are usually low operational risk because humans can close, ignore, or revert them.

High-risk means the daemon could interfere with human workflows or take actions that are hard or annoying to reverse: force-pushing over human changes, mutating production state, deleting branches or resources, changing production flags, closing or reprioritizing many issues, or posting noisy output across surfaces.

High-risk examples should be authored conservatively:

- require evidence before consequential claims or writes
- prefer reviewable artifacts over direct mutation
- keep scope narrow
- include strong no-op behavior for ambiguity
- deny nearby risky shortcuts
- make visible output easy to review

The risk posture belongs in `DAEMON.md`, especially `deny`, `Policy`, `Scope`, `Limits`, `Coordination`, and no-op guidance. Do not try to encode runtime risk policy in `example.yml`.

## Adaptation challenges to account for

Public examples look copyable, but many daemon roles are only safe or useful when the target repo has the right integrations, conventions, tools, permissions, evidence sources, and operating norms.

Account for these common challenges when choosing and authoring examples:

- **Integration availability:** Optional integrations may not be connected, may be read-only, or may not be the customer's source of truth.
- **Runtime and wake support gaps:** Event-driven daemon activation is GitHub-first today; use scheduled surveys when the natural source does not have a supported wake path.
- **Repo tooling assumptions:** Package managers, commands, CI providers, generated artifacts, deploy systems, and migration tools vary.
- **Language and framework assumptions:** Examples can accidentally encode framework or language assumptions that do not transfer.
- **Workflow conventions:** Labels, statuses, owners, PR conventions, and output preferences are customer-specific.
- **Safety and permission boundaries:** Customers differ on what Charlie may do automatically versus only propose.
- **Evidence requirements:** Claims such as "duplicate," "unused," "confirmed," or "fully rolled out" require strong evidence.
- **Output destination fit:** Comments, PRs, issues, Slack posts, and docs all have different noise costs.
- **Existing automation overlap:** Examples can duplicate or fight existing bots, scripts, alerts, or workflows.
- **Environment and secret access:** Some commands require setup or credentials, and some validation commands can mutate remote state.
- **State, memory, and history requirements:** Some examples need prior daemon history, durable IDs, or long-lived state to be useful.
- **Scale and noise sensitivity:** An example that works in a small repo can flood a large repo or high-volume team.
- **Public example safety:** Public examples must not contain private links, customer names, internal paths, private thresholds, or private provenance.
- **Version and drift risk:** Examples can drift from runtime, dashboard copy behavior, supported integrations, and schema rules.

## Platform and integration boundaries

### Do not hide platform differences in one example

If a platform changes the daemon's source of truth, routines, output surface, or required permissions, make a separate example.

Separate examples are easier for Charlie to recommend, easier for humans to understand, and easier to keep correct than one example with hidden branching.

Rule of thumb: if the platform changes daemon behavior, split the example.

### Use optional integrations only for optional enhancements

`requirements.optionalIntegrations` should mean the daemon can still perform its core role without that integration. It should not mean "one of these platforms is required."

If the daemon cannot perform its core role without choosing a platform-specific source of truth, write platform-specific examples instead of encoding the choice as an optional integration.

Use `requirements.other` to name source-of-truth assumptions in plain language, but do not use optional integrations to encode required alternatives.

## Writing `DAEMON.md`

### Keep the runtime contract clean

Use only daemon runtime frontmatter fields:

- `id`
- `purpose`
- `watch`
- `routines`
- `deny`
- `schedule`

Do not add example metadata to `DAEMON.md`. Fields such as `readiness`, `showOnWebsite`, `showInDashboard`, `bestFor`, `requirements`, `riskTier`, and `activationMode` do not belong in runtime frontmatter.

### Write the narrowest useful role

A strong example daemon has one outcome-oriented `purpose` and usually two or three concrete `routines`.

Split broad ideas when routines have different wake logic, risk, integrations, or output surfaces.

Prefer a small daemon that customers can trust over a broad daemon that looks impressive but is hard to review.

### Choose wake posture honestly

Use `watch` for concrete observable events. Today, watch-driven daemon activation is GitHub-first, so GitHub PR, check, commit, and merge events are the best fit for event-driven examples.

Use `schedule` for surveys, reconciliation, reports, and workflows whose source of truth is not currently a supported event wake.

Use both only when both wake paths materially help the same narrow role.

Do not imply unsupported Linear, Slack, Sentry, monitoring, or feature flag event wakes in `watch`.

### Put runtime behavior in the body

The markdown body should contain guidance that changes daemon behavior. Useful sections include:

- `Policy`
- `Scope`
- `Limits`
- `Output format`
- `Coordination`
- `Ignore patterns`
- `Thresholds`
- `Examples`

Put evidence gates in the body when they determine what the daemon may do. Put no-op behavior in the body when ambiguity, missing evidence, or conflicting signals should stop action.

Do not put per-example rollout or verification instructions in `DAEMON.md`. Rollout and testing guidance belongs in the general daemon docs, not in each example daemon.

### Deny nearby risky shortcuts

`deny` should cover plausible shortcuts the daemon might otherwise take to finish its job. Avoid generic filler.

Common deny patterns include:

- Do not merge pull requests.
- Do not approve pull requests on behalf of humans.
- Do not force-push over human changes.
- Do not push to another person's active PR branch unless local branch ownership policy explicitly allows it.
- Do not delete resources automatically.
- Do not close issues unless explicitly authorized by local policy.
- Do not change production configuration or flags.
- Do not post repeated comments or broad notifications for unchanged evidence.
- Do not run deploy, apply, destroy, or migration commands.
- Do not broaden a fix beyond the triggering failure or selected candidate.

## Editing existing examples

When editing an example, preserve the example's role unless the role itself is wrong. Do not rewrite a daemon package from scratch when a targeted edit will solve the problem.

First diagnose the failure mode:

- The example is a poor fit for the public catalog.
- The daemon wakes for the wrong things.
- The daemon wakes correctly but acts too broadly.
- The daemon lacks evidence gates, limits, scope, or no-op behavior.
- The daemon assumes unsupported wake behavior.
- The metadata overstates fit or hides requirements.
- The adaptation instructions are too vague.
- The package contains private or internal-only context.

Then edit the right surface:

- Change `DAEMON.md` when runtime behavior, scope, routines, deny rules, or output policy are wrong.
- Change `example.yml` when catalog presentation, fit, requirements, or local customization guidance are wrong.
- Change `scripts/**` or `references/**` when support assets are stale, unclear, unsafe, or not customer-facing.

Keep edits narrow and preserve any guidance that is already working.

## Support assets

Support files are copied to customer repositories with the daemon. They must be public-safe and customer-facing.

Use `scripts/**` for small deterministic helpers. Use `references/**` for rubrics, templates, taxonomies, provider policies, and other context the daemon can read.

A support file should either make runtime behavior safer or make required local adaptation easier. Do not use support files as hidden product dependencies, and do not use them for per-example rollout checklists.

## Writing `example.yml` well

For the exact schema, allowed keys, enum values, and strict validation rules, read the [daemon examples v2 spec](./examples-spec.md).

### Catalog fields present the example

The top-level catalog fields determine how product, docs, dashboard, and Charlie present the example:

- `id`
- `title`
- `status`
- `summary`
- `readiness`
- `showOnWebsite`
- `showInDashboard`

Keep `summary` short and public-safe. Use `readiness` only for copy posture: `direct-copy` or `adapt-before-use`. Do not use readiness to encode risk, maturity, or rollout state.

Dashboard visibility is a curation decision, not a runtime capability claim.

### `fit` explains recommendation fit

Use `fit` to help Charlie and humans decide whether to recommend the example.

`fit.jobsToBeDone` connects the example to the JTBD taxonomy.

`fit.bestFor` should describe high-fit customer, repo, or team situations.

`fit.notFor` should describe clear poor-fit conditions.

Keep first-wave versus advanced guidance in prose for now. Do not add schema for maturity until repeated usage proves it is needed.

### `requirements` names preconditions

Use `requirements` for things that must exist before the example can work usefully.

`requiredIntegrations` are hard integration blockers.

`optionalIntegrations` are optional enhancements only. Do not use them for required alternatives.

`other` captures non-integration prerequisites. Keep entries concrete and public-safe.

Do not use `requirements` for recommendations, caveats, runtime policy, rollout steps, or validation instructions.

### `adaptation.mustCustomize` names local decisions

`adaptation.mustCustomize` is the only adaptation key. It should list concrete local decisions, replacements, or confirmations needed before the example is safe or useful.

Good `mustCustomize` items are local decisions:

- Confirm the relevant source-of-truth system.
- Replace placeholder labels, statuses, channels, paths, commands, or policy names.
- Confirm which local commands or checks the daemon should reference.
- Set customer-specific output destinations.

Bad `mustCustomize` items are generic warnings or process instructions:

- Run this on a staging repo first.
- Verify that it works.
- Be careful with production.
- This is risky.
- Watch the first few activations.

Rollout and verification instructions do not belong in `example.yml`; they are covered by the general daemon docs.

## Quality check before publishing

### Candidate fit

Before turning a candidate into a public example, check:

- Is the JTBD clear?
- Is the role recurring and bounded?
- Is the output reviewable on a native surface?
- Is the adaptation load acceptable for the intended catalog surface?
- If the example can interfere with human workflows or take hard-to-reverse actions, is that risk intentional and bounded?

### Runtime file quality

Check `DAEMON.md`:

- Frontmatter uses only daemon runtime fields.
- `id` matches the daemon directory.
- `purpose` is outcome-oriented.
- `routines` are concrete and finite.
- `watch` describes observable events, or `schedule` describes a meaningful recurring survey.
- Adjacent risky shortcuts are denied.
- Body guidance is specific and behavior-shaping.
- Ambiguous or insufficient evidence paths no-op, propose, or escalate.

### Metadata quality

Check `example.yml`:

- It uses only the strict schema.
- All text is public-safe.
- `fit` helps Charlie recommend or reject the example.
- `requirements` names real blockers.
- `optionalIntegrations` are truly optional.
- `mustCustomize` lists local decisions only.

### Package quality

Check the full example package:

- No private provenance is present.
- Support files are useful and public-safe.
- Support files are customer-facing and copied with the daemon.
- Customer copy excludes only `example.yml`.
- The example does not depend on hidden Charlie-internal context.

## Anti-patterns

Avoid these common failures:

- One example tries to cover multiple platforms with hidden branching.
- `example.yml` becomes a configuration language.
- `DAEMON.md` contains setup, tutorial, or catalog metadata.
- `mustCustomize` contains rollout or verification instructions.
- Optional integrations are used to encode required alternatives.
- The daemon assumes unsupported non-GitHub event wakes.
- The daemon requires production secrets or mutating infra commands to be useful.
- The daemon mostly produces noise or restates known information.
- The daemon is so broad that every activation requires judgment outside its authored policy.

## Spec reference

For exact package structure, identity rules, `example.yml` schema, support-file rules, customer copy semantics, generated artifact expectations, and the validation checklist, use the [daemon examples v2 spec](./examples-spec.md).
