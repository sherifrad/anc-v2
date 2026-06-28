# ANC-EMR Decisions

## ADR Policy

After the Release 1 governance freeze, any governance change requires a formal ADR entry in this file. ADR entries must state the decision, context, consequences, and Release 1 impact.

## Governance Amendment Rule

Any governance amendment after freeze must record:

- rule being changed;
- reason;
- clinical or engineering trigger;
- alternatives considered;
- consequences;
- Release 1 impact;
- approval status.

## ADR-001: Release 1 Uses localStorage

Decision: `localStorage` is accepted for Release 1.

Context: The current app persists through `js/db.js` and browser `localStorage`.

Consequences: Do not migrate to IndexedDB/Dexie during Release 1 unless explicitly approved by a future ADR.

## ADR-002: Basic Offline Release Has No Auth/MFA/Cloud Sync

Decision: Release 1 runs locally without sign-in, MFA, Supabase/cloud sync, user roles, temporary staff access, or online encryption unlock gates.

Context: The pilot target is a single-user offline clinic workflow.

Consequences: Auth/cloud code may remain present but is deferred and inactive.

## ADR-003: Encryption At Rest And Encrypted Backups Deferred

Decision: Encryption at rest and encrypted backups are deferred for the 30-patient pilot.

Context: Workflow validation is the Release 1 priority.

Consequences: This is accepted IT security/persistence risk, separate from clinical safety.

## ADR-004: Summary Is Primary Workspace

Decision: Summary is the patient home screen, clinical dashboard, and navigation hub.

Context: Clinicians need a paper-like overview before focused editing.

Consequences: Future slices should strengthen Summary first.

## ADR-005: Focused Workspaces Are Full-Screen States

Decision: Focused Workspaces are full-screen application states, not modals, popups, or overlays.

Context: Mobile-first clinical entry needs stable, spacious editing surfaces.

Consequences: Reuse existing DOM where practical and avoid adding modal-based edit flows.

## ADR-006: Vertical Slice Development Required

Decision: Work proceeds by one complete vertical slice at a time.

Context: Release 1 prioritizes fast, stable delivery over broad refactoring.

Consequences: Do not continue to another feature without instruction.

## ADR-007: Risk Classification Remains Manual

Decision: Risk classification remains manually entered for Release 1.

Context: Automatic clinical risk classification can mislead if incomplete.

Consequences: No automatic risk classification or silent risk upgrades in Release 1.

## ADR-008: Governance Revision 1.1 And Freeze Process

Decision: Revision 1.1 becomes the Release 1 governance baseline after documentation alignment and State Schema Audit completion.

Context: Previous governance omitted Definition of Ready, Definition of Done, hierarchy, and a completed data contract.

Consequences: Governance authority follows the defined hierarchy, governance changes after freeze require a new ADR, and State Schema Audit must precede data-driven UI implementation.
