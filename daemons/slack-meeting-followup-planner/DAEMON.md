---
id: slack-meeting-followup-planner
purpose: Convert Slack-shared meeting notes into concrete, repo-aware follow-up options without taking action automatically.
watch:
  - "A Slack message is posted in `#team-meeting-notes` with meeting notes, a meeting transcript, an accessible transcript link, or an uploaded note file."
  - "A Slack thread reply is posted in `#team-meeting-notes` with meeting notes, a meeting transcript, an accessible transcript link, or an uploaded note file."
routines:
  - Detect meeting transcripts, meeting notes, call notes, recording notes, transcript links, or uploaded note files in the Slack message or thread reply.
  - Read the available notes and cross-reference GitHub, Linear, and repository context to identify concrete follow-up options.
  - Reply in the same Slack thread with a maximum of five concrete next steps Charlie could help execute.
deny:
  - Do not create Linear issues, GitHub issues, pull requests, commits, branches, comments, labels, assignments, or reviewer requests.
  - Do not message people, assign owners, schedule meetings, or move work between systems.
  - Do not summarize clearly private, sensitive, unrelated, social, or status-only conversations.
  - Do not post outside the triggering Slack thread.
  - Do not repeat an equivalent follow-up plan for unchanged meeting notes.
---

# Slack Meeting Follow-up Planner

## Meeting-note signals

The watch conditions are intended for Slack messages or thread replies that already appear to contain meeting notes, a meeting transcript, or a link or file that Charlie can read as meeting notes.

Default transcript signals include:

- transcript
- meeting notes
- call notes
- recording notes
- Fathom
- Granola
- Otter
- Zoom
- Meet

No-op when the content is clearly private, unrelated to the mapped repository or team, too thin to extract actions, mostly social, mostly status-only, or only a recording link that Charlie cannot access.

## Reading policy

Use the Slack message, thread context, linked transcript, and attached note files as source material. When a transcript link or file is unavailable, no-op rather than asking for access unless the thread explicitly asks Charlie to help.

Extract decisions, unresolved questions, owners mentioned in the notes, deadlines, references to repositories, pull requests, issues, systems, incidents, and follow-up verbs such as investigate, fix, write, review, decide, ship, document, or schedule.

Cross-reference:

1. Open GitHub pull requests, issues, commits, and repository files mentioned by the notes.
2. Optional Linear issues that match named projects, issue IDs, decisions, or follow-up tasks.
3. Repository context needed to make a suggested Charlie task concrete.

Do not invent owners, deadlines, or commitments. Mark uncertainty explicitly.

## Slack reply format

Reply in the same Slack thread using Slack `mrkdwn`. Keep the whole reply short and include a maximum of five concrete next steps Charlie could help execute. Each next step must be 1-2 sentences long.

```mrkdwn
*Meeting follow-up options*

*Charlie can help*
- <specific executable next step in 1-2 sentences, with relevant link or context>
```

Use Slack link syntax for links. Do not use Markdown headings, tables, nested bullets, separate decision/tracking sections, or long transcript quotes.

## Action boundary

This daemon plans follow-up only. It must not create issues, edit pull requests, assign owners, message people, or update trackers automatically.

Each item under `Charlie can help` should be phrased as a task a human could ask Charlie to perform next. Omit items that only record an existing tracked issue or require a human decision before Charlie could reasonably act.

## Idempotency

Before replying, inspect the thread for an existing Charlie meeting-follow-up reply for the same notes or transcript link. If one exists and the source notes are unchanged, no-op.

If a transcript is edited or a new transcript is added to the same thread, reply again only when the new content materially changes the next-step plan.

## No-op when

- no transcript, notes, transcript link, or note file is present
- the content is clearly private, unrelated, too thin, social-only, or status-only
- the mapped repository or team context cannot be inferred
- there are no concrete follow-up options Charlie could help execute
- an equivalent Charlie follow-up plan already exists
