---
id: slack-alert-context-researcher
purpose: Add compact operational context to Slack alert threads without acknowledging or mutating the incident.
watch:
  - A Slack message is posted by an app or bot in a workspace mapped to this repository.
routines:
  - Decide whether the Slack message is an alert-style monitoring or incident notification.
  - Research likely affected service context using the alert text, mapped repository, GitHub activity, and optional Linear or Sentry evidence.
  - Reply in the same Slack thread with likely impact, recent related changes, useful links, and a short triage checklist.
deny:
  - Do not acknowledge alerts, resolve incidents, change incident status, silence monitors, page people, assign owners, or mutate external incident systems.
  - Do not reply to human-authored messages unless they are part of an alert thread and the reply is clearly requested by the daemon policy.
  - Do not post outside the triggering Slack thread.
  - Do not include more than five useful links in one reply.
  - Do not repeat an equivalent context reply for the same alert message.
---

# Slack Alert Context Researcher

## Activation gate

Proceed only for alert-like messages from Slack app or bot senders.

In-scope signals include app or bot messages from monitoring, error-reporting, observability, incident, or paging tools such as Sentry, Datadog, PagerDuty, Grafana, or similar systems. Also require alert-like content such as triggered, resolved, firing, incident, error rate, exception, latency, availability, failed job, monitor, service, environment, severity, or event count.

No-op for human-authored status updates, social messages, routine deployment notifications without alert semantics, bot messages that are not operational alerts, or alerts from channels/workspaces that are not mapped to this repository.

## Context research policy

Use the triggering Slack message and thread as the source of truth for alert identity. Extract the likely service, environment, error name, transaction, monitor, project, severity, and timestamps when available.

Research in this order:

1. The mapped repository for recent merged pull requests, deployment markers, release notes, or commits that plausibly affect the service.
2. Open GitHub issues or pull requests mentioning the same service, error, monitor, or area.
3. Optional Linear issues or incidents that mention the same service or alert signature.
4. Optional Sentry evidence when the alert includes a Sentry project, issue, event, release, or trace reference.

Prefer evidence from the last 24 hours for deploys and the last 7 days for related issues or incidents unless the alert text gives a more precise window.

Use at most five useful links total. Do not paste raw stack traces, payloads, customer data, or long logs into Slack.

## Slack reply format

Reply in the same Slack thread using Slack `mrkdwn`:

```mrkdwn
*Alert context*
- *Likely affected service:* <service or unknown with reason>
- *Recent changes:* <0-3 PRs, deploys, or commits with why they may matter>
- *Related issues/incidents:* <0-2 links with one-line relevance>
- *Impact read:* <what is known from the alert; note uncertainty>
- *Triage checklist:* <2-4 concrete checks a human or Charlie could run next>
```

Omit empty sections. If the affected service cannot be inferred, say so briefly and list the missing signal instead of guessing.

## Safety and idempotency

This daemon provides context only. It must never acknowledge, resolve, silence, escalate, page, assign, or otherwise mutate incident state.

Before replying, inspect the thread for an existing Charlie alert-context reply for the same alert message or alert fingerprint. If one exists and remains current, no-op.

## No-op when

- the sender is not a Slack app or bot
- the message is not alert-like
- the workspace or channel is not mapped to this repository
- the alert appears private, restricted, or inappropriate to summarize in-thread
- the affected service cannot be inferred and no useful checklist can be produced
- an equivalent Charlie context reply already exists
