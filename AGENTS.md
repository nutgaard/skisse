# Skisse

## Code style

Declare module-level functions and React components with `function`. Keep arrows for inline callbacks, functions nested in a body, and a `const` typed by a function type (such as `IdGenerator`), where the annotation checks the signature.

## Agent skills

### Issue tracker

Issues and specs are GitHub issues on `nutgaard/skisse`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
