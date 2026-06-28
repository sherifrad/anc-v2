# Project Backlog

This file is authoritative for actionable epics/features and post-pilot backlog. It must not contain detailed implementation steps.

Approved statuses: Proposed, Approved, In Progress, Blocked, Completed, Deferred, Cancelled, Archived.

Approved priorities: P0, P1, P2, P3.

| ID | Title | Priority | Status | Dependency | Brief outcome |
| --- | --- | --- | --- | --- | --- |
| EPIC-001 | Basic Offline Release | P0 | In Progress | None | Single-user local clinic pilot for approximately 30 patients. |
| FEATURE-001 | SCM/Governance Revision 1.1 Alignment | P0 | Completed | None | Align Release 1 governance docs with Revision 1.1. |
| FEATURE-002 | Release 1 State Schema Audit | P0 | Approved | FEATURE-001 | Populate actual persisted state contract from existing implementation. |
| FEATURE-003 | Paper-like Summary V2 | P0 | Approved | FEATURE-002 | Make Summary the patient home screen, clinical dashboard, and navigation hub. |
| FEATURE-004 | Focused Editable Workspaces | P0 | Approved | FEATURE-002, FEATURE-003 | Prepare full-screen focused workspaces for complete clinical slices. |
| FEATURE-005 | Stabilization Sprint | P1 | Proposed | FEATURE-003, FEATURE-004 | Stabilize workflow, save/load, display, print/PDF, and local backup basics. |
| FEATURE-006 | Clinical Pilot | P0 | Proposed | FEATURE-005 | Project owner validates Release 1 in limited clinical use. |

## Deferred / Post-Pilot

| ID | Title | Priority | Status | Dependency | Brief outcome |
| --- | --- | --- | --- | --- | --- |
| POST-001 | Encrypted backup/restore using existing `crypto.js` where feasible | P2 | Deferred | Clinical Pilot | Add stronger backup protection after workflow validation. |
| POST-002 | Dexie/IndexedDB migration after workflow stabilization | P2 | Deferred | Clinical Pilot | Improve persistence model after Release 1 workflow is stable. |
| POST-003 | Dashboard / Action Center | P2 | Deferred | Clinical Pilot | Add broader clinic-level operational dashboard. |
| POST-004 | Fixed smart lists | P2 | Deferred | Dashboard / Action Center | Add predefined patient list filters. |
| POST-005 | Custom smart lists/filter builder | P3 | Deferred | Fixed smart lists | Add configurable list building. |
| POST-006 | Timeline view | P2 | Deferred | Clinical Pilot | Add chronological clinical record review. |
| POST-007 | Print/PDF derived from Summary | P1 | Deferred | Paper-like Summary V2 | Generate print output from Summary when stable. |
| POST-008 | Automatic scheduled backup/export | P2 | Deferred | Clinical Pilot | Add scheduled local backup/export workflow. |
| POST-009 | Supabase/cloud sync | P3 | Deferred | Clinical Pilot | Add multi-device/cloud capability later. |
| POST-010 | Auth/user roles | P3 | Deferred | Clinical Pilot | Add access control after offline pilot. |
| POST-011 | OCR | P3 | Deferred | Clinical Pilot | Add document extraction later. |
| POST-012 | AI | P3 | Deferred | Clinical Pilot | Add AI assistance later. |
