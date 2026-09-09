# Prepared, in-page learning

Articles can carry optional `learningPlay` version 1 alongside the original body
and `learningExperience`. The connected author prepares every quiz option,
hint, explanation, experiment state and transition before saving the article.
The browser only selects prepared data. No inference endpoint, executable
author code, cookie mutation, progress write or automatic mastery update is
used by these controls.

## Journey

Prediction → answer-specific feedback → finite-scene experiment → application
question → the original article's real-system explanation and code.
Every activity is optional. Hints, answer reveal, arbitrary step selection,
experiment reset, pause and resume are local to the mounted page. Reloading
starts fresh; this is not cross-device saved progress.

## Data and safety

`src/lib/learningPlay.ts` mirrors the ingestion contract in the backend repository.
Only two activity kinds are supported: quiz and experiment. Unique IDs, exactly
one correct answer, valid and reachable scene targets, bounded text and counts
are validated. React renders plain text; there is no eval or authored HTML.
Malformed or absent metadata falls back to the legacy article experience.
The backend validates and secret-scans the payload, persists it in the existing
article document, and includes it in the owner-only full-article MCP read/hash.
The new field is optional for old callers but requested in generation guidance.

The session fixture describes a server-side session model, not the site's own
auth implementation. Its transitions never alter the real browser session.

Tests drive the component's actual handlers through the repository's Node-only
test setup and verify no fetch calls, answer feedback, state transitions,
optional navigation and legacy behavior. No browser visual QA is claimed.
