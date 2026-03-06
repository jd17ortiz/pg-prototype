// ─── Roles ────────────────────────────────────────────────────────────────────
export type Role = "RD_ENGINEER" | "MT_ENGINEER" | "APPROVER" | "OPERATOR";

// ─── Site ─────────────────────────────────────────────────────────────────────
export interface Site {
  id: string;
  name: string;
  code: string;
}

// ─── User ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  siteId: string;
}

// ─── Template Schema ──────────────────────────────────────────────────────────
export type FieldType = "text" | "number" | "date" | "select";

export interface HeaderField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

export type SectionType =
  | "richText"
  | "fieldGrid"
  | "table"
  | "parameterTable"
  | "media"
  | "flowDiagram"
  | "changeHistory";

export interface GridField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

export interface TableColumn {
  id: string;
  label: string;
  type: FieldType;
  width?: number;
  options?: string[];
}

export interface SectionConfig {
  // fieldGrid
  fields?: GridField[];
  // table
  columns?: TableColumn[];
  // richText
  placeholder?: string;
  // parameterTable — no extra config needed (fixed schema)
}

export interface Section {
  id: string;
  type: SectionType;
  title: string;
  config: SectionConfig;
  required?: boolean;
}

export interface Sheet {
  id: string;
  name: string;
  sections: Section[];
}

export interface TemplateSchema {
  headerFields: HeaderField[];
  sheets: Sheet[];
}

// ─── Template ─────────────────────────────────────────────────────────────────
export type TemplateVersionStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface TemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  status: TemplateVersionStatus;
  schemaJson: TemplateSchema;
  createdAt: string;
  updatedAt: string;
  versionStamp: string;
  publishedBy?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Guideline Content ────────────────────────────────────────────────────────
export interface ParameterRow {
  id: string;
  name: string;
  value: string;
  unit: string;
  min: string;
  max: string;
  isLocked: boolean;
  isCritical: boolean;
}

export interface MediaFile {
  id: string;
  fileName: string;
  fileType: string;
  size: number;
  uploadedAt: string;
  description?: string;
  // attachment ref (E)
  fileId?: string;
}

export interface ChangeHistoryEntry {
  id: string;
  date: string;
  author: string;
  description: string;
  version: string;
}

export type SectionContentValue =
  | { type: "richText"; html: string }
  | { type: "fieldGrid"; values: Record<string, string> }
  | { type: "table"; rows: Record<string, string>[] }
  | { type: "parameterTable"; rows: ParameterRow[] }
  | { type: "media"; files: MediaFile[] }
  | { type: "flowDiagram"; description: string }
  | { type: "changeHistory"; entries: ChangeHistoryEntry[] };

export interface SheetContent {
  sections: Record<string, SectionContentValue>;
}

export interface ContentJson {
  headerValues: Record<string, string>;
  sheets: Record<string, SheetContent>;
}

// ─── Normalized Payload ───────────────────────────────────────────────────────
export interface NormalizedParameter {
  id: string;
  name: string;
  value: string;
  unit: string;
  min: string;
  max: string;
  isLocked: boolean;
  isCritical: boolean;
  sheetId: string;
  sheetName: string;
  sectionId: string;
  sectionTitle: string;
}

export interface NormalizedPayload {
  parameters: NormalizedParameter[];
}

// ─── Guideline ────────────────────────────────────────────────────────────────
export type GuidelineType = "PARENT" | "LOCAL" | "CHILD";
export type GuidelineVersionStatus = "DRAFT" | "REVIEW" | "ACTIVE" | "ARCHIVED";

export interface Guideline {
  id: string;
  name: string;
  type: GuidelineType;
  siteId: string;
  parentGuidelineId?: string;
  /** The parent's ACTIVE version ID at the time of cloning (PASS 2 lock enforcement) */
  parentActiveVersionId?: string;
  templateVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuidelineVersion {
  id: string;
  guidelineId: string;
  versionNumber: number;
  status: GuidelineVersionStatus;
  contentJson: ContentJson;
  normalizedPayload: NormalizedPayload;
  reasonForChange?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  versionStamp: string;
}

// ─── Approval ─────────────────────────────────────────────────────────────────
export type ApprovalDecision = "APPROVE" | "REJECT";

export interface Approval {
  id: string;
  guidelineVersionId: string;
  approverId: string;
  decision: ApprovalDecision;
  comment?: string;
  createdAt: string;
}

// ─── Audit ────────────────────────────────────────────────────────────────────
export type AuditEntityType =
  | "Template"
  | "TemplateVersion"
  | "Guideline"
  | "GuidelineVersion"
  | "Approval"
  | "ComplianceTask";

export interface AuditEvent {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  userId: string;
  userName?: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

// ─── Compliance Tasks (PASS 2 C) ──────────────────────────────────────────────
export type ComplianceTaskStatus = "OPEN" | "DONE";

export interface ComplianceTask {
  id: string;
  parentGuidelineId: string;
  parentVersionId: string;  // the new ACTIVE parent version that triggered this
  childGuidelineId: string;
  siteId: string;
  status: ComplianceTaskStatus;
  createdAt: string;
  completedAt?: string;
}

export interface ComplianceStore {
  tasks: ComplianceTask[];
}

// ─── Diff types (PASS 2 B) ────────────────────────────────────────────────────
export type DiffChangeType = "added" | "removed" | "changed";

export interface DiffEntry {
  type: DiffChangeType;
  path: string;        // e.g. "Sheet: Mixing / Section: Params / pH min"
  field?: string;      // which field changed (value, unit, min, max…)
  oldValue?: string;
  newValue?: string;
  label: string;       // human-readable description
}

export interface DiffResult {
  hasChanges: boolean;
  summary: { added: number; removed: number; changed: number };
  entries: DiffEntry[];
}

// ─── DB Store types ───────────────────────────────────────────────────────────
export interface SitesStore {
  sites: Site[];
}

export interface UsersStore {
  users: User[];
}

export interface TemplatesStore {
  templates: Template[];
  versions: TemplateVersion[];
}

export interface GuidelinesStore {
  guidelines: Guideline[];
  versions: GuidelineVersion[];
  approvals: Approval[];
}

export interface AuditStore {
  events: AuditEvent[];
}

// ─── API response helpers ─────────────────────────────────────────────────────
export interface ApiError {
  error: string;
  details?: unknown;
}

export interface StaleWriteError extends ApiError {
  code: "STALE_WRITE";
  current: string;
}

// ─── Lock validation result ───────────────────────────────────────────────────
export interface LockViolation {
  paramName: string;
  field: string;
  parentValue: string;
  childValue: string;
  message: string;
}
