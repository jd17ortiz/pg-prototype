#!/usr/bin/env node
/**
 * Sanity check script for PGS prototype data files.
 * Usage: node scripts/sanity-check.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

let errors = 0;
let warnings = 0;

function err(msg) { console.error(`  [ERROR] ${msg}`); errors++; }
function warn(msg) { console.warn(`  [WARN]  ${msg}`); warnings++; }
function ok(msg)  { console.log(`  [OK]    ${msg}`); }

function readJson(name) {
  const p = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(p)) { err(`Missing file: ${name}.json`); return null; }
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { err(`Invalid JSON in ${name}.json: ${e.message}`); return null; }
}

// ─── Load all stores ──────────────────────────────────────────────────────────
const sites      = readJson("sites");
const users      = readJson("users");
const templates  = readJson("templates");
const guidelines = readJson("guidelines");
const audit      = readJson("audit");
const compliance = readJson("compliance");

if (!sites || !users || !templates || !guidelines || !audit) {
  console.error("\nAborted: missing core data files.");
  process.exit(1);
}

const siteIds     = new Set((sites.sites ?? []).map(s => s.id));
const userIds     = new Set((users.users ?? []).map(u => u.id));
const tmplIds     = new Set((templates.templates ?? []).map(t => t.id));
const tmplvIds    = new Set((templates.versions ?? []).map(v => v.id));
const glIds       = new Set((guidelines.guidelines ?? []).map(g => g.id));
const glvIds      = new Set((guidelines.versions ?? []).map(v => v.id));

// ─── Sites ────────────────────────────────────────────────────────────────────
console.log("\nSites:");
const siteList = sites.sites ?? [];
if (siteList.length === 0) warn("No sites defined");
else ok(`${siteList.length} site(s)`);

// ─── Users ────────────────────────────────────────────────────────────────────
console.log("\nUsers:");
const userList = users.users ?? [];
if (userList.length === 0) err("No users defined");
else ok(`${userList.length} user(s)`);

const VALID_ROLES = new Set(["RD_ENGINEER", "MT_ENGINEER", "APPROVER", "OPERATOR"]);
for (const u of userList) {
  if (!VALID_ROLES.has(u.role)) err(`User ${u.id} has invalid role: ${u.role}`);
  if (u.siteId && !siteIds.has(u.siteId)) warn(`User ${u.id} references unknown siteId: ${u.siteId}`);
}

// ─── Templates ────────────────────────────────────────────────────────────────
console.log("\nTemplates:");
const tmplList = templates.templates ?? [];
const tmplvList = templates.versions ?? [];
ok(`${tmplList.length} template(s), ${tmplvList.length} version(s)`);

for (const tv of tmplvList) {
  if (!tmplIds.has(tv.templateId)) err(`TemplateVersion ${tv.id} references unknown templateId: ${tv.templateId}`);
  if (!tv.schemaJson) err(`TemplateVersion ${tv.id} has no schemaJson`);
  else {
    if (!Array.isArray(tv.schemaJson.sheets)) err(`TemplateVersion ${tv.id} schemaJson.sheets is not an array`);
    if (!Array.isArray(tv.schemaJson.headerFields)) err(`TemplateVersion ${tv.id} schemaJson.headerFields is not an array`);
  }
}

// ─── Guidelines ───────────────────────────────────────────────────────────────
console.log("\nGuidelines:");
const glList  = guidelines.guidelines ?? [];
const glvList = guidelines.versions ?? [];
const aprList = guidelines.approvals ?? [];
ok(`${glList.length} guideline(s), ${glvList.length} version(s), ${aprList.length} approval(s)`);

const VALID_TYPES   = new Set(["PARENT", "LOCAL", "CHILD"]);
const VALID_STATUSES = new Set(["DRAFT", "REVIEW", "ACTIVE", "ARCHIVED"]);

for (const g of glList) {
  if (!VALID_TYPES.has(g.type)) err(`Guideline ${g.id} has invalid type: ${g.type}`);
  if (!siteIds.has(g.siteId)) warn(`Guideline ${g.id} references unknown siteId: ${g.siteId}`);
  if (!tmplvIds.has(g.templateVersionId)) err(`Guideline ${g.id} references unknown templateVersionId: ${g.templateVersionId}`);
  if (g.type === "CHILD" && g.parentGuidelineId && !glIds.has(g.parentGuidelineId)) {
    err(`Child guideline ${g.id} references unknown parentGuidelineId: ${g.parentGuidelineId}`);
  }
}

for (const v of glvList) {
  if (!glIds.has(v.guidelineId)) err(`GuidelineVersion ${v.id} references unknown guidelineId: ${v.guidelineId}`);
  if (!VALID_STATUSES.has(v.status)) err(`GuidelineVersion ${v.id} has invalid status: ${v.status}`);
  if (!v.contentJson) err(`GuidelineVersion ${v.id} has no contentJson`);
  if (!v.versionStamp) warn(`GuidelineVersion ${v.id} has no versionStamp`);
}

// Check each guideline has at most one DRAFT version
for (const g of glList) {
  const drafts = glvList.filter(v => v.guidelineId === g.id && v.status === "DRAFT");
  if (drafts.length > 1) err(`Guideline ${g.id} has ${drafts.length} DRAFT versions (only 1 allowed)`);
}

// Approvals
for (const a of aprList) {
  if (!glvIds.has(a.guidelineVersionId)) err(`Approval ${a.id} references unknown guidelineVersionId: ${a.guidelineVersionId}`);
  if (!userIds.has(a.approverId)) warn(`Approval ${a.id} references unknown approverId: ${a.approverId}`);
  if (!["APPROVE","REJECT"].includes(a.decision)) err(`Approval ${a.id} has invalid decision: ${a.decision}`);
}

// ─── Compliance ───────────────────────────────────────────────────────────────
console.log("\nCompliance:");
if (!compliance) {
  warn("No compliance.json found (will be created on first use)");
} else {
  const tasks = compliance.tasks ?? [];
  ok(`${tasks.length} compliance task(s)`);
  for (const t of tasks) {
    if (!glIds.has(t.parentGuidelineId)) warn(`ComplianceTask ${t.id} references unknown parentGuidelineId: ${t.parentGuidelineId}`);
    if (!glIds.has(t.childGuidelineId)) warn(`ComplianceTask ${t.id} references unknown childGuidelineId: ${t.childGuidelineId}`);
    if (!["OPEN","DONE"].includes(t.status)) err(`ComplianceTask ${t.id} has invalid status: ${t.status}`);
  }
}

// ─── Audit ────────────────────────────────────────────────────────────────────
console.log("\nAudit:");
ok(`${(audit.events ?? []).length} audit event(s)`);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
if (errors === 0 && warnings === 0) {
  console.log("All checks passed.");
} else {
  if (errors > 0)   console.error(`${errors} error(s) found.`);
  if (warnings > 0) console.warn(`${warnings} warning(s) found.`);
  if (errors > 0) process.exit(1);
}
