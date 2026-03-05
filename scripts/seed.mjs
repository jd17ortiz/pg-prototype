import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

function write(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();
const vs = () => Date.now().toString();

// ─── Sites ────────────────────────────────────────────────────────────────────
const SITE_EU = { id: "site-eu", name: "EU Plant - Frankfurt", code: "EU-FRA" };
const SITE_US = { id: "site-us", name: "US Plant - Houston", code: "US-HOU" };

write("sites", { sites: [SITE_EU, SITE_US] });

// ─── Users ────────────────────────────────────────────────────────────────────
const users = [
  { id: "u-rde1",  name: "Anna Müller",    email: "anna@eu.plant",   role: "RD_ENGINEER", siteId: "site-eu" },
  { id: "u-mte1",  name: "Klaus Weber",    email: "klaus@eu.plant",  role: "MT_ENGINEER", siteId: "site-eu" },
  { id: "u-apr1",  name: "Dr. Hans Braun", email: "hans@eu.plant",   role: "APPROVER",    siteId: "site-eu" },
  { id: "u-opr1",  name: "Petra Lang",     email: "petra@eu.plant",  role: "OPERATOR",    siteId: "site-eu" },
  { id: "u-rde2",  name: "James Carter",   email: "james@us.plant",  role: "RD_ENGINEER", siteId: "site-us" },
  { id: "u-mte2",  name: "Sarah Johnson",  email: "sarah@us.plant",  role: "MT_ENGINEER", siteId: "site-us" },
  { id: "u-apr2",  name: "Dr. Mark Davis", email: "mark@us.plant",   role: "APPROVER",    siteId: "site-us" },
  { id: "u-opr2",  name: "Lisa Brown",     email: "lisa@us.plant",   role: "OPERATOR",    siteId: "site-us" },
];
write("users", { users });

// ─── Helper: field/section id generators ──────────────────────────────────────
let _counter = 1;
const seq = () => `id${_counter++}`;

// ─── Template 1: EU Processleitplan ──────────────────────────────────────────
const T1_ID = "tmpl-eu-plp";
const T1V_ID = "tmplv-eu-plp-1";

const t1Schema = {
  headerFields: [
    { id: "h-docno",    label: "Document No.",      type: "text",   required: true,  defaultValue: "" },
    { id: "h-product",  label: "Product Name",       type: "text",   required: true,  defaultValue: "" },
    { id: "h-version",  label: "Version",            type: "text",   required: true,  defaultValue: "1.0" },
    { id: "h-date",     label: "Effective Date",     type: "date",   required: true,  defaultValue: "" },
    { id: "h-site",     label: "Site",               type: "text",   required: false, defaultValue: "" },
    { id: "h-dept",     label: "Department",         type: "text",   required: false, defaultValue: "Manufacturing" },
  ],
  sheets: [
    {
      id: "sheet-op1", name: "Operation 1 – Dispensing",
      sections: [
        { id: "s-op1-rte",  type: "richText",       title: "Purpose & Scope",       config: { placeholder: "Describe purpose..." }, required: false },
        { id: "s-op1-fg",   type: "fieldGrid",      title: "Operation Details",     config: { fields: [
          { id: "fg-op1-eq",  label: "Equipment ID",     type: "text",   required: true,  defaultValue: "" },
          { id: "fg-op1-mat", label: "Material Code",    type: "text",   required: true,  defaultValue: "" },
          { id: "fg-op1-op",  label: "Operator Sign",   type: "text",   required: false, defaultValue: "" },
        ]}},
        { id: "s-op1-pt",   type: "parameterTable", title: "Process Parameters",    config: {} },
        { id: "s-op1-tbl",  type: "table",          title: "Ingredients",           config: { columns: [
          { id: "tc-name",  label: "Ingredient",    type: "text" },
          { id: "tc-qty",   label: "Quantity (kg)", type: "number" },
          { id: "tc-lot",   label: "Lot No.",       type: "text" },
        ]}},
      ],
    },
    {
      id: "sheet-op2", name: "Operation 2 – Mixing",
      sections: [
        { id: "s-op2-fg",   type: "fieldGrid",      title: "Mixing Details",        config: { fields: [
          { id: "fg-op2-spd", label: "Mixer Speed (rpm)", type: "number", required: true, defaultValue: "" },
          { id: "fg-op2-dur", label: "Mix Duration (min)",type: "number", required: true, defaultValue: "" },
        ]}},
        { id: "s-op2-pt",   type: "parameterTable", title: "Process Parameters",    config: {} },
        { id: "s-op2-fd",   type: "flowDiagram",    title: "Flow Diagram",          config: {} },
      ],
    },
    {
      id: "sheet-op3", name: "Operation 3 – QC & Release",
      sections: [
        { id: "s-op3-tbl",  type: "table",          title: "QC Checks",             config: { columns: [
          { id: "tc-qctest",   label: "Test",         type: "text" },
          { id: "tc-qcspec",   label: "Specification",type: "text" },
          { id: "tc-qcresult", label: "Result",       type: "text" },
          { id: "tc-qcpass",   label: "Pass/Fail",    type: "select", options: ["Pass","Fail","N/A"] },
        ]}},
        { id: "s-op3-media", type: "media",          title: "Supporting Documents",  config: {} },
        { id: "s-op3-ch",    type: "changeHistory",  title: "Change History",        config: {} },
      ],
    },
  ],
};

// ─── Template 2: Simple SOP Blocks ───────────────────────────────────────────
const T2_ID = "tmpl-sop";
const T2V_ID = "tmplv-sop-1";

const t2Schema = {
  headerFields: [
    { id: "h2-title",   label: "SOP Title",         type: "text",  required: true,  defaultValue: "" },
    { id: "h2-code",    label: "SOP Code",           type: "text",  required: true,  defaultValue: "" },
    { id: "h2-rev",     label: "Revision",           type: "text",  required: true,  defaultValue: "A" },
    { id: "h2-date",    label: "Issue Date",         type: "date",  required: true,  defaultValue: "" },
  ],
  sheets: [
    {
      id: "sheet-setup", name: "Setup",
      sections: [
        { id: "s-setup-rte",  type: "richText",  title: "Setup Instructions", config: {} },
        { id: "s-setup-fg",   type: "fieldGrid", title: "Pre-checks",         config: { fields: [
          { id: "fg-setup-env", label: "Environment Temp (°C)", type: "number", required: true,  defaultValue: "" },
          { id: "fg-setup-rh",  label: "Relative Humidity (%)", type: "number", required: false, defaultValue: "" },
        ]}},
      ],
    },
    {
      id: "sheet-exec", name: "Execution",
      sections: [
        { id: "s-exec-rte",  type: "richText",       title: "Execution Steps",     config: {} },
        { id: "s-exec-pt",   type: "parameterTable", title: "Key Parameters",      config: {} },
        { id: "s-exec-tbl",  type: "table",          title: "Material Checklist",  config: { columns: [
          { id: "tc-item",   label: "Item",   type: "text" },
          { id: "tc-status", label: "Status", type: "select", options: ["Pending","Done","N/A"] },
        ]}},
      ],
    },
    {
      id: "sheet-cleanup", name: "Cleanup",
      sections: [
        { id: "s-clean-rte", type: "richText",      title: "Cleanup Instructions", config: {} },
        { id: "s-clean-ch",  type: "changeHistory", title: "Change History",       config: {} },
      ],
    },
  ],
};

// ─── Template 3: Batch Ticket ─────────────────────────────────────────────────
const T3_ID = "tmpl-batch";
const T3V_ID = "tmplv-batch-1";

const t3Schema = {
  headerFields: [
    { id: "h3-batchno",  label: "Batch No.",        type: "text",   required: true,  defaultValue: "" },
    { id: "h3-product",  label: "Product",          type: "text",   required: true,  defaultValue: "" },
    { id: "h3-qty",      label: "Batch Size",       type: "number", required: true,  defaultValue: "" },
    { id: "h3-mfgdate",  label: "Mfg. Date",        type: "date",   required: true,  defaultValue: "" },
    { id: "h3-expdate",  label: "Exp. Date",        type: "date",   required: false, defaultValue: "" },
  ],
  sheets: [
    {
      id: "sheet-bt-main", name: "Batch Record",
      sections: [
        { id: "s-bt-ing", type: "table", title: "Bill of Materials", config: { columns: [
          { id: "tc-bt-item",  label: "Raw Material",   type: "text" },
          { id: "tc-bt-code",  label: "Item Code",      type: "text" },
          { id: "tc-bt-qty",   label: "Required (kg)",  type: "number" },
          { id: "tc-bt-act",   label: "Actual (kg)",    type: "number" },
          { id: "tc-bt-lot",   label: "Lot No.",        type: "text" },
          { id: "tc-bt-init",  label: "Initials",       type: "text" },
        ]}},
        { id: "s-bt-pt",  type: "parameterTable", title: "Critical Parameters", config: {} },
        { id: "s-bt-qc",  type: "table",          title: "In-Process QC",       config: { columns: [
          { id: "tc-bt-qcstep",   label: "Step",        type: "text" },
          { id: "tc-bt-qcspec",   label: "Spec",        type: "text" },
          { id: "tc-bt-qcval",    label: "Value",       type: "text" },
          { id: "tc-bt-qcok",     label: "OK?",         type: "select", options: ["Yes","No","N/A"] },
        ]}},
        { id: "s-bt-ch",  type: "changeHistory", title: "Change History", config: {} },
      ],
    },
  ],
};

// ─── Write Templates ──────────────────────────────────────────────────────────
const templates = [
  { id: T1_ID, name: "EU Processleitplan", description: "Sheet-per-operation format with mixed section types", createdAt: now(), updatedAt: now() },
  { id: T2_ID, name: "Simple SOP Blocks",  description: "Setup / Execution / Cleanup workflow",               createdAt: now(), updatedAt: now() },
  { id: T3_ID, name: "Batch Ticket",       description: "Table-first batch manufacturing record",             createdAt: now(), updatedAt: now() },
];

const templateVersions = [
  { id: T1V_ID, templateId: T1_ID, versionNumber: 1, status: "ACTIVE", schemaJson: t1Schema, createdAt: now(), updatedAt: now(), versionStamp: vs(), publishedBy: "u-rde1" },
  { id: T2V_ID, templateId: T2_ID, versionNumber: 1, status: "ACTIVE", schemaJson: t2Schema, createdAt: now(), updatedAt: now(), versionStamp: vs(), publishedBy: "u-rde1" },
  { id: T3V_ID, templateId: T3_ID, versionNumber: 1, status: "ACTIVE", schemaJson: t3Schema, createdAt: now(), updatedAt: now(), versionStamp: vs(), publishedBy: "u-rde2" },
];

write("templates", { templates, versions: templateVersions });

// ─── Guidelines ───────────────────────────────────────────────────────────────

// Helper: make contentJson for T1 schema (parent)
function makeParentContent() {
  return {
    headerValues: {
      "h-docno":    "PLP-EU-001",
      "h-product":  "Alpha Compound",
      "h-version":  "2.1",
      "h-date":     "2025-01-15",
      "h-site":     "Frankfurt",
      "h-dept":     "R&D Manufacturing",
    },
    sheets: {
      "sheet-op1": {
        sections: {
          "s-op1-rte":  { type: "richText", html: "<p>This procedure covers the dispensing of raw materials for Alpha Compound production.</p>" },
          "s-op1-fg":   { type: "fieldGrid", values: { "fg-op1-eq": "DISP-001", "fg-op1-mat": "MAT-ALP-01", "fg-op1-op": "" } },
          "s-op1-pt":   { type: "parameterTable", rows: [
            { id: "pr1", name: "pH min",         value: "6.8",  unit: "pH",  min: "6.5",  max: "7.0",  isLocked: true,  isCritical: true },
            { id: "pr2", name: "pH max",         value: "7.2",  unit: "pH",  min: "7.0",  max: "7.5",  isLocked: true,  isCritical: true },
            { id: "pr3", name: "Temperature",    value: "22",   unit: "°C",  min: "18",   max: "25",   isLocked: false, isCritical: false },
            { id: "pr4", name: "Humidity",       value: "45",   unit: "%RH", min: "40",   max: "60",   isLocked: false, isCritical: false },
          ]},
          "s-op1-tbl":  { type: "table", rows: [
            { "tc-name": "Compound A", "tc-qty": "12.5", "tc-lot": "LOT-2024-001" },
            { "tc-name": "Buffer B",   "tc-qty": "5.0",  "tc-lot": "LOT-2024-002" },
          ]},
        },
      },
      "sheet-op2": {
        sections: {
          "s-op2-fg":   { type: "fieldGrid", values: { "fg-op2-spd": "150", "fg-op2-dur": "30" } },
          "s-op2-pt":   { type: "parameterTable", rows: [
            { id: "pr5", name: "Agitator Speed", value: "150",  unit: "rpm", min: "100",  max: "200",  isLocked: true,  isCritical: true },
            { id: "pr6", name: "Mix Time",       value: "30",   unit: "min", min: "25",   max: "35",   isLocked: false, isCritical: false },
          ]},
          "s-op2-fd":   { type: "flowDiagram", description: "Raw materials → Dispensing → Pre-mix → Main mixing vessel → QC sampling → Transfer" },
        },
      },
      "sheet-op3": {
        sections: {
          "s-op3-tbl":  { type: "table", rows: [
            { "tc-qctest": "pH",         "tc-qcspec": "6.8–7.2", "tc-qcresult": "7.0", "tc-qcpass": "Pass" },
            { "tc-qctest": "Appearance", "tc-qcspec": "Clear",   "tc-qcresult": "Clear","tc-qcpass": "Pass" },
          ]},
          "s-op3-media": { type: "media", files: [] },
          "s-op3-ch":    { type: "changeHistory", entries: [
            { id: "ch1", date: "2025-01-10", author: "Anna Müller", description: "Initial release", version: "1.0" },
            { id: "ch2", date: "2025-01-15", author: "Anna Müller", description: "Updated pH parameters per validation study", version: "2.1" },
          ]},
        },
      },
    },
  };
}

function normalizeParams(contentJson, schema) {
  const parameters = [];
  for (const sheet of schema.sheets) {
    const sheetContent = contentJson.sheets[sheet.id];
    if (!sheetContent) continue;
    for (const section of sheet.sections) {
      if (section.type !== "parameterTable") continue;
      const sectionContent = sheetContent.sections[section.id];
      if (!sectionContent || sectionContent.type !== "parameterTable") continue;
      for (const row of sectionContent.rows) {
        parameters.push({ ...row, sheetId: sheet.id, sheetName: sheet.name, sectionId: section.id, sectionTitle: section.title });
      }
    }
  }
  return { parameters };
}

// Parent Guideline - ACTIVE
const PG_ID = "gl-parent-eu-001";
const PGV_ID = "glv-parent-eu-001-v1";
const parentContent = makeParentContent();

// Local Guideline - ACTIVE (Site EU, uses SOP template)
const LG_ID = "gl-local-eu-001";
const LGV_ID = "glv-local-eu-001-v1";

function makeLocalContent() {
  return {
    headerValues: {
      "h2-title": "Cleaning SOP – Dispensing Area",
      "h2-code":  "SOP-CL-001",
      "h2-rev":   "B",
      "h2-date":  "2025-02-01",
    },
    sheets: {
      "sheet-setup": {
        sections: {
          "s-setup-rte":  { type: "richText", html: "<p>Ensure all personnel wear appropriate PPE before starting cleanup.</p>" },
          "s-setup-fg":   { type: "fieldGrid", values: { "fg-setup-env": "20", "fg-setup-rh": "50" } },
        },
      },
      "sheet-exec": {
        sections: {
          "s-exec-rte":  { type: "richText", html: "<p>1. Remove all product residues. 2. Apply cleaning agent. 3. Rinse thoroughly.</p>" },
          "s-exec-pt":   { type: "parameterTable", rows: [
            { id: "lpr1", name: "Contact Time", value: "15", unit: "min", min: "10", max: "20", isLocked: false, isCritical: false },
          ]},
          "s-exec-tbl":  { type: "table", rows: [
            { "tc-item": "Safety goggles", "tc-status": "Done" },
            { "tc-item": "Cleaning agent dilution (1:10)", "tc-status": "Done" },
          ]},
        },
      },
      "sheet-cleanup": {
        sections: {
          "s-clean-rte":  { type: "richText", html: "<p>Verify all surfaces pass visual inspection before sign-off.</p>" },
          "s-clean-ch":   { type: "changeHistory", entries: [
            { id: "lch1", date: "2025-02-01", author: "Klaus Weber", description: "Initial release", version: "A" },
            { id: "lch2", date: "2025-02-15", author: "Klaus Weber", description: "Updated contact time per audit finding", version: "B" },
          ]},
        },
      },
    },
  };
}

const localContent = makeLocalContent();

// Child Guideline - DRAFT (cloned from parent, US site)
const CG_ID = "gl-child-us-001";
const CGV_ID = "glv-child-us-001-v1";

function makeChildContent() {
  // Start from parent, then customize slightly
  const content = JSON.parse(JSON.stringify(makeParentContent()));
  content.headerValues["h-docno"]   = "PLP-US-001";
  content.headerValues["h-site"]    = "Houston";
  content.headerValues["h-version"] = "1.0";
  content.headerValues["h-date"]    = "2025-03-01";
  // US site: slightly different temperature target (still within parent range)
  content.sheets["sheet-op1"].sections["s-op1-pt"].rows[2].value = "20";
  // Keep locked parameters same as parent
  return content;
}

const childContent = makeChildContent();

const guidelines = [
  {
    id: PG_ID, name: "Alpha Compound – Processleitplan", type: "PARENT",
    siteId: "site-eu", templateVersionId: T1V_ID, createdAt: now(), updatedAt: now(),
  },
  {
    id: LG_ID, name: "Cleaning SOP – Dispensing Area", type: "LOCAL",
    siteId: "site-eu", templateVersionId: T2V_ID, createdAt: now(), updatedAt: now(),
  },
  {
    id: CG_ID, name: "Alpha Compound – Processleitplan (US)", type: "CHILD",
    siteId: "site-us", parentGuidelineId: PG_ID, templateVersionId: T1V_ID, createdAt: now(), updatedAt: now(),
  },
];

const guidelineVersions = [
  {
    id: PGV_ID, guidelineId: PG_ID, versionNumber: 1, status: "ACTIVE",
    contentJson: parentContent, normalizedPayload: normalizeParams(parentContent, t1Schema),
    authorId: "u-rde1", createdAt: now(), updatedAt: now(), versionStamp: vs(),
  },
  {
    id: LGV_ID, guidelineId: LG_ID, versionNumber: 1, status: "ACTIVE",
    contentJson: localContent, normalizedPayload: normalizeParams(localContent, t2Schema),
    authorId: "u-mte1", createdAt: now(), updatedAt: now(), versionStamp: vs(),
  },
  {
    id: CGV_ID, guidelineId: CG_ID, versionNumber: 1, status: "DRAFT",
    contentJson: childContent, normalizedPayload: normalizeParams(childContent, t1Schema),
    authorId: "u-rde2", createdAt: now(), updatedAt: now(), versionStamp: vs(),
  },
];

const approvals = [
  {
    id: "apr-001", guidelineVersionId: PGV_ID, approverId: "u-apr1",
    decision: "APPROVE", comment: "Reviewed and approved. pH parameters validated.", createdAt: now(),
  },
  {
    id: "apr-002", guidelineVersionId: LGV_ID, approverId: "u-apr1",
    decision: "APPROVE", comment: "Approved after audit review.", createdAt: now(),
  },
];

write("guidelines", { guidelines, versions: guidelineVersions, approvals });

// ─── Audit ────────────────────────────────────────────────────────────────────
const auditEvents = [
  { id: "ae1", entityType: "Guideline",        entityId: PG_ID,  action: "CREATED",              userId: "u-rde1", userName: "Anna Müller",    data: { name: "Alpha Compound – Processleitplan" }, createdAt: now() },
  { id: "ae2", entityType: "GuidelineVersion",  entityId: PGV_ID, action: "SUBMITTED_FOR_REVIEW", userId: "u-rde1", userName: "Anna Müller",    data: {}, createdAt: now() },
  { id: "ae3", entityType: "Approval",          entityId: "apr-001", action: "APPROVED",          userId: "u-apr1", userName: "Dr. Hans Braun", data: { comment: "Reviewed and approved." }, createdAt: now() },
  { id: "ae4", entityType: "Guideline",         entityId: LG_ID,  action: "CREATED",              userId: "u-mte1", userName: "Klaus Weber",    data: { name: "Cleaning SOP" }, createdAt: now() },
  { id: "ae5", entityType: "Approval",          entityId: "apr-002", action: "APPROVED",          userId: "u-apr1", userName: "Dr. Hans Braun", data: { comment: "Approved after audit." }, createdAt: now() },
  { id: "ae6", entityType: "Guideline",         entityId: CG_ID,  action: "CLONED_FROM_PARENT",   userId: "u-rde2", userName: "James Carter",   data: { parentGuidelineId: PG_ID }, createdAt: now() },
];
write("audit", { events: auditEvents });

console.log("✓ Seed complete:");
console.log(`  Sites:    ${[SITE_EU, SITE_US].length}`);
console.log(`  Users:    ${users.length}`);
console.log(`  Templates: ${templates.length} (each with 1 ACTIVE version)`);
console.log(`  Guidelines: ${guidelines.length}`);
console.log(`  Audit events: ${auditEvents.length}`);
