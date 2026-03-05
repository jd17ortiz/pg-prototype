# Digital Process Guideline System — PASS 1 Prototype

A working web prototype for managing process guidelines with full governance workflow.

## Quick Start

```bash
npm install
npm run seed    # reset demo data
npm run dev     # start dev server → http://localhost:3000
```

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **TailwindCSS v4**
- **Zod** server-side validation
- **JSON-on-disk** persistence via Route Handlers (Node runtime)
- **Atomic writes** (temp file + rename)
- **versionStamp** for stale-write rejection

## Data Files

All data is stored under `/data/`:

| File | Contents |
|---|---|
| `sites.json` | 2 plant sites (EU Frankfurt, US Houston) |
| `users.json` | 8 users covering all 4 roles |
| `templates.json` | 3 templates + versions |
| `guidelines.json` | 3 guidelines + versions + approvals |
| `audit.json` | Audit event timeline |

## Roles (Mock Login)

Select any user on the login page. RBAC is enforced server-side.

| Role | Permissions |
|---|---|
| `RD_ENGINEER` | Create/edit templates and guidelines, submit for review |
| `MT_ENGINEER` | Create/edit guidelines, submit for review |
| `APPROVER` | Approve or reject guidelines in REVIEW status |
| `OPERATOR` | Read-only access |

**Seeded users:**

| Name | Role | Site |
|---|---|---|
| Anna Müller | RD_ENGINEER | EU Frankfurt |
| Klaus Weber | MT_ENGINEER | EU Frankfurt |
| Dr. Hans Braun | APPROVER | EU Frankfurt |
| Petra Lang | OPERATOR | EU Frankfurt |
| James Carter | RD_ENGINEER | US Houston |
| Sarah Johnson | MT_ENGINEER | US Houston |
| Dr. Mark Davis | APPROVER | US Houston |
| Lisa Brown | OPERATOR | US Houston |

## Seeded Templates

1. **EU Processleitplan** — 3-sheet layout (Dispensing / Mixing / QC), mixed section types
2. **Simple SOP Blocks** — Setup / Execution / Cleanup
3. **Batch Ticket** — Table-first batch manufacturing record

## Seeded Guidelines

| Name | Type | Status | Site |
|---|---|---|---|
| Alpha Compound – Processleitplan | PARENT | ACTIVE | EU |
| Cleaning SOP – Dispensing Area | LOCAL | ACTIVE | EU |
| Alpha Compound – Processleitplan (US) | CHILD | DRAFT | US |

## Features Implemented

### 1. Template System
- Template Library with version list
- Template Builder: add/reorder sheets and sections (buttons, no drag/drop)
- Section types: richText, fieldGrid, table, parameterTable, media, flowDiagram, changeHistory
- Header field configuration (label, type, required)
- Preview mode — print-like with header repeated per sheet
- Publish Draft → Active (archives prior active)

### 2. Guidelines + Governance
- Create Guideline Wizard (site, type, template selection)
- Guideline types: PARENT, LOCAL, CHILD
- One ACTIVE version per guideline enforced server-side
- ACTIVE/ARCHIVED versions are immutable
- Full version history displayed

### 3. Dynamic Guideline Editor
- Template-driven rendering (sheet navigation sidebar)
- All section types are editable
- Locked parameters shown as read-only (from normalizedPayload)
- Autosave (2-second debounce after changes)
- Unsaved-changes warning on page unload
- Parameter Registry side panel — search across all parameters

### 4. Workflow
- DRAFT → Submit for Review → REVIEW
- APPROVER: Approval Inbox + Approve/Reject with comment
- Separation of duties enforced (author != approver)
- Approve → ACTIVE (prior ACTIVE auto-archived)
- Reject → back to DRAFT
- New Version from ACTIVE (requires reasonForChange for v>1)

### 5. Parent->Child Clone
- Clone PARENT guideline to CHILD for any site
- Copies active content as new DRAFT
- Locked parameters carry over and are read-only in editor
- Parent relationship link shown in UI

### 6. Print View
- ACTIVE versions only
- Header repeated per sheet
- Print/Save PDF via browser print dialog
- `/guidelines/[id]/print` route

### 7. Audit Trail
- All actions logged (create, save, submit, approve, reject, clone, publish)
- Audit timeline modal on guideline detail page

## API Routes

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/sites
GET    /api/users
GET    /api/audit?entityId=...
GET    /api/templates
POST   /api/templates
GET    /api/templates/[id]
PATCH  /api/templates/[id]
GET    /api/templates/[id]/versions
PUT    /api/templates/[id]/versions          (save draft schema)
POST   /api/templates/[id]/versions/[vid]/publish
GET    /api/guidelines?siteId=...&type=...
POST   /api/guidelines
GET    /api/guidelines/[id]
PUT    /api/guidelines/[id]/versions         (save draft content)
POST   /api/guidelines/[id]/versions/[vid]/submit
POST   /api/guidelines/[id]/versions/[vid]/approve
POST   /api/guidelines/[id]/versions/[vid]/new-version
POST   /api/guidelines/[id]/clone
```

## 6-Step Demo Script

Visit `/demo` in the running app for the interactive demo script with navigation links.

1. **Template Builder** — Explore EU Processleitplan template structure and preview
2. **Create Guideline** — Use the wizard to create from an active template
3. **Edit & Autosave** — Fill sections, edit parameter tables, watch autosave
4. **Submit -> Approve** — Full governance workflow with role switching
5. **New Version** — Create draft from active, require reason for change
6. **Clone & Print** — Clone parent to child site, use browser print view
