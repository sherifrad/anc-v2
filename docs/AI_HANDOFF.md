# AI Handoff

This is the primary AI behavior contract for Release 1.

## Governance Hierarchy

In case of conflict, authority flows in this order:

1. `ARCHITECTURE.md`
2. `DECISIONS.md`
3. `STATE_SCHEMA.md`
4. `PROJECT_BACKLOG.md`
5. `CURRENT_TASK.md`
6. implementation code

Lower-authority artifacts may not contradict higher-authority artifacts. `MASTER_PLAN.md` and `ROADMAP.md` are non-operational Product Reference Documents and are not part of the normal implementation authority chain.

## AI Rules

- Clinical Workflow First: clinical workflow has priority over infrastructure.
- Accepted technical debt must not be fixed automatically.
- Blind AI Safeguard: if relevant file contents are not available, halt and request them before claiming inspection, reuse audit, DOM audit, or implementation.
- DOM Conservation Rule: before adding structural DOM, inspect existing DOM and reuse containers when technically reasonable.
- Reuse Before Rewrite: inspect existing implementation first; refactor narrowly before writing new code.
- Vertical Slice Development: implement one complete slice at a time.
- Full-Screen Focused Workspaces: workspaces are full-screen view states, not modals, popups, or overlays.
- Codex implements; project owner validates.
- Codex must not commit, push, run servers, open browsers, create or alter runtime patient records, or perform destructive restore/import unless explicitly instructed for that exact execution.
- Release 1 testing uses existing focused Node `.mjs` scripts only.
- Do not introduce Jest, Mocha, Playwright, Cypress, or another test framework.

## Definition Of Ready

A vertical slice is Ready only when all are true:

- target slice is explicitly defined;
- relevant source files are available to the AI;
- clinical data inputs are explicitly listed;
- expected visual or behavioral outputs are explicitly listed;
- reuse audit scope is identified;
- state-shape impact is declared as unchanged or requiring a `STATE_SCHEMA.md` update.

If relevant files are not available, the AI must halt and request them. It must not claim inspection of files it cannot access.

## Definition Of Done

A vertical slice is Done only when:

- requested scope is completed;
- existing behavior is preserved;
- no unrelated files are changed;
- no unnecessary refactoring occurred;
- relevant existing focused Node `.mjs` tests pass when available;
- no new testing framework is introduced;
- a manual browser validation checklist is supplied to the project owner;
- documentation is synchronized;
- state-shape impact is explicitly reported.

Accepted technical debt is authoritative in `ARCHITECTURE.md`; deferred actionable work is authoritative in `PROJECT_BACKLOG.md`.
