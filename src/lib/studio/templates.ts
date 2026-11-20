export interface Template { id: string; label: string; hint: string; body: () => string }

const today = () => new Date().toISOString().slice(0, 10);

/** Mẫu tài liệu cho File → New from template. Nội dung tiếng Anh, trung tính, để người dùng thay chữ. */
export const TEMPLATES: Template[] = [
  {
    id: 'readme', label: 'README', hint: 'project overview',
    body: () => `# Project name

One sentence on what this is and who it is for.

## Install

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`js
import { thing } from 'project-name';

thing();
\`\`\`

## Development

\`\`\`bash
npm install
npm test
\`\`\`

## License

MIT
`,
  },
  {
    id: 'adr', label: 'Decision record', hint: 'ADR',
    body: () => `# ADR-001: Title of the decision

- Status: proposed
- Date: ${today()}
- Deciders: names

## Context

What problem are we solving, and what constraints apply?

## Decision

What we will do.

## Consequences

- What gets easier.
- What gets harder.

## Alternatives considered

- Option A: why not.
- Option B: why not.
`,
  },
  {
    id: 'meeting', label: 'Meeting notes', hint: 'agenda, decisions, actions',
    body: () => `# Meeting: topic

- Date: ${today()}
- Attendees: names

## Agenda

1. Item one
2. Item two

## Notes

-

## Decisions

-

## Action items

- [ ] Owner: task, due date
- [ ] Owner: task, due date
`,
  },
  {
    id: 'changelog', label: 'Changelog', hint: 'Keep a Changelog',
    body: () => `# Changelog

All notable changes to this project are listed here.

## [Unreleased]

### Added

-

### Changed

-

### Fixed

-

## [1.0.0] - ${today()}

### Added

- Initial release.
`,
  },
  {
    id: 'design', label: 'Design doc', hint: 'goals, options, plan',
    body: () => `# Design doc: short title

- Status: draft
- Author: name
- Updated: ${today()}

> [!NOTE]
> One paragraph a new teammate can read in a minute: the problem, the proposal, and what you need from reviewers.

## Background

What exists today, and why it is not enough. Link the incident, ticket or metric that triggered this.

## Goals and non-goals

- Goal: something measurable.
- Goal: something measurable.
- Non-goal: something that is tempting but out of scope.

## Proposal

Describe the change at the level where a reviewer can find the flaw.

\`\`\`mermaid
flowchart LR
    Client --> API --> Queue --> Worker --> Store[(Database)]
\`\`\`

### Data model

| Field      | Type   | Notes                  |
| :--------- | :----- | :--------------------- |
| \`id\`       | uuid   | primary key            |
| \`state\`    | enum   | pending, done, failed  |
| \`created\`  | time   | UTC                    |

## Alternatives considered

| Option | Pros | Cons |
| :----- | :--- | :--- |
| A      |      |      |
| B      |      |      |

## Risks and open questions

- [ ] Question that blocks the decision
- [ ] Risk and how it is mitigated

## Rollout

1. Ship behind a flag.
2. Enable for internal traffic, watch the dashboards.
3. Ramp to 100% and remove the old path.
`,
  },
  {
    id: 'postmortem', label: 'Incident postmortem', hint: 'timeline, causes, actions',
    body: () => `# Postmortem: short description of the incident

- Date: ${today()}
- Duration: 0h 00m
- Severity: SEV-2
- Authors: names

> [!IMPORTANT]
> Blameless format: describe what the system and the process allowed, not who made a mistake.

## Summary

Two or three sentences: what broke, who was affected, how it was fixed.

## Impact

- Users affected:
- Requests failed:
- Revenue or SLA impact:

## Timeline (UTC)

| Time  | Event                                  |
| :---- | :------------------------------------- |
| 10:02 | Deploy of version X starts             |
| 10:09 | Error rate alert fires                 |
| 10:14 | On-call acknowledges, starts triage    |
| 10:31 | Rollback complete, errors back to zero |

## Root cause

What actually failed, traced back until a process or design gap is visible.

## What went well

-

## What went badly

-

## Action items

| Action | Owner | Due | Ticket |
| :----- | :---- | :-- | :----- |
|        |       |     |        |
`,
  },
  {
    id: 'runbook', label: 'Runbook', hint: 'alert, checks, fixes',
    body: () => `# Runbook: alert name

- Service: name
- Owner: team
- Last reviewed: ${today()}

## When this fires

What the alert means in one sentence, and how urgent it is.

## Check first

1. Is it real? Open the dashboard and compare with the last 24 hours.
2. Did something ship? \`git log --since="2 hours ago" --oneline\`
3. Is a dependency down? Check the status page of the upstream service.

\`\`\`bash
# health, logs, saturation
curl -fsS https://service.example.com/healthz
kubectl logs deploy/service --since=15m | tail -n 100
kubectl top pods -l app=service
\`\`\`

## Fixes

### Bad deploy

Roll back to the previous version, then open an incident.

\`\`\`bash
kubectl rollout undo deploy/service
kubectl rollout status deploy/service
\`\`\`

### Saturation

Scale out first, investigate second.

\`\`\`bash
kubectl scale deploy/service --replicas=6
\`\`\`

## Escalate

If not resolved in 30 minutes, page the secondary on-call and post in the incident channel.
`,
  },
  {
    id: 'bug', label: 'Bug report', hint: 'steps, expected, actual',
    body: () => `# Bug: short, specific title

## Environment

- Version or commit:
- OS and browser:
- Configuration that matters:

## Steps to reproduce

1. Go to ...
2. Click ...
3. Observe ...

## Expected behavior

What should happen.

## Actual behavior

What happens instead. Paste the exact error text.

\`\`\`text
error output here
\`\`\`

## Impact and workaround

Who is blocked, and is there a way around it?

## Notes

Anything already ruled out, related issues, a suspected cause.
`,
  },
  {
    id: 'pr', label: 'Pull request', hint: 'what, why, how tested',
    body: () => `# Title of the change

## What

One or two sentences on the change.

## Why

The problem this solves. Link the issue: Closes #123.

## How

- Main idea of the implementation.
- Anything surprising a reviewer should look at first.

## Testing

- [ ] Unit tests added or updated
- [ ] Tried manually: describe the scenario
- [ ] Checked the logs and metrics after deploy

## Screenshots or output

Before and after, if the change is visible.

## Risk and rollback

What can go wrong, and how to revert (flag, revert commit, migration down).
`,
  },
  {
    id: 'weekly', label: 'Weekly update', hint: 'done, next, blocked',
    body: () => `# Week of ${today()}

## Done

- Shipped: what, with a link.
- Fixed: what, with a link.

## Next

- Top priority for next week.
- Second priority.

## Blocked or at risk

- What is blocked, on whom, and since when.

## Numbers

| Metric          | Last week | This week |
| :-------------- | --------: | --------: |
| Deploys         |           |           |
| Open bugs       |           |           |
| p95 latency, ms |           |           |

## Notes

Anything the team should know that does not fit above.
`,
  },
  {
    id: 'api', label: 'API reference', hint: 'endpoint, params, errors',
    body: () => `# API reference

Base URL: \`https://api.example.com/v1\`

Authenticate with a bearer token: \`Authorization: Bearer <token>\`.

## Create an item

\`POST /items\`

| Field   | Type   | Required | Description              |
| :------ | :----- | :------: | :----------------------- |
| \`name\`  | string |   yes    | Display name, max 120    |
| \`tags\`  | array  |    no    | Up to 10 strings         |

\`\`\`bash
curl -X POST https://api.example.com/v1/items \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "First item", "tags": ["demo"]}'
\`\`\`

Response \`201 Created\`:

\`\`\`json
{
  "id": "itm_01HZ",
  "name": "First item",
  "tags": ["demo"],
  "created": "${today()}T09:30:00Z"
}
\`\`\`

## Errors

| Status | Code               | Meaning                          |
| -----: | :----------------- | :------------------------------- |
|    400 | \`invalid_request\`  | A field is missing or malformed  |
|    401 | \`unauthorized\`     | Token missing or expired         |
|    429 | \`rate_limited\`     | Retry after the \`Retry-After\` header |
`,
  },
  {
    id: 'note', label: 'Technical note', hint: 'math, diagram, code',
    body: () => `# Technical note

Updated: ${today()}

State the claim first, then show the work.

> [!TIP]
> Wrap inline math in single dollar signs and display math in double dollar signs on their own lines.

## Idea

Inline formula: $E = mc^2$. A displayed one:

$$
\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i,
\\qquad
s^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}\\left(x_i - \\bar{x}\\right)^2
$$

## Flow

\`\`\`mermaid
sequenceDiagram
    participant A as Client
    participant B as Server
    A->>B: request
    B-->>A: response
\`\`\`

## Code

\`\`\`python
def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs)
\`\`\`

## References

- Author, *Title*, year.
`,
  },
];
