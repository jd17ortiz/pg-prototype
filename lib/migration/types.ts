// ─── Source traceability ──────────────────────────────────────────────────────
export interface SourceRef {
  sheet: string;
  cell?: string;   // e.g. "C4"
  range?: string;  // e.g. "C25:K39"
  label?: string;  // anchor label that was found
}

// ─── Extracted data ───────────────────────────────────────────────────────────
export interface ExtractedField {
  fieldId: string;
  label: string;
  value: string;
  sourceRef: SourceRef;
}

export interface ExtractedRow {
  rowIndex: number;
  values: Record<string, string>;
  sourceRef: SourceRef;
}

export interface ExtractedTable {
  id: string;
  title: string;
  sheetName: string;
  columns: { id: string; label: string }[];
  rows: ExtractedRow[];
  headerRef: SourceRef;
}

export interface ExtractedParameter {
  id: string;
  name: string;
  value: string;
  unit: string;
  min: string;
  max: string;
  isLocked: boolean;
  isCritical: boolean;
  sourceRef: SourceRef;
}

export interface ExtractedParameterTable {
  id: string;
  sheetName: string;
  parameters: ExtractedParameter[];
}

export interface ExtractedChangeEntry {
  num: number;
  date: string;
  author: string;
  description: string;
  sourceRef: SourceRef;
}

// ─── Warnings ─────────────────────────────────────────────────────────────────
export interface ImportWarning {
  severity: "error" | "warning" | "info";
  message: string;
  field?: string;
  sourceRef?: SourceRef;
}

// ─── Full import preview (returned by parser, stored in import run) ────────────
export interface ImportPreview {
  profileId: string;
  profileName: string;
  sheetNames: string[];
  fields: ExtractedField[];
  tables: ExtractedTable[];
  parameterTables: ExtractedParameterTable[];
  changeHistory: ExtractedChangeEntry[];
  warnings: ImportWarning[];
  // Derived key fields
  identifier: string | null;    // extracted PLP number
  productName: string | null;   // extracted PRODUKTNAME
  revision: string | null;      // extracted REV
}

// ─── Import run record ────────────────────────────────────────────────────────
export interface ImportRun {
  id: string;
  fileId: string;
  filename: string;
  siteId: string;
  profileId: string;
  templateVersionId: string;
  createdBy: string;
  createdAt: string;
  resultGuidelineId?: string;
  resultVersionId?: string;
  warnings: ImportWarning[];
  preview: ImportPreview;
}

export interface ImportsStore {
  runs: ImportRun[];
}

// ─── Mapping profile types ────────────────────────────────────────────────────
export type ReadStrategy =
  | { type: "below" }                         // same col, one row below anchor
  | { type: "right" }                         // same row, one col right of anchor
  | { type: "fixed-col"; col: number }        // same row, fixed column index
  | { type: "scan-row" };                     // collect all non-empty values in same row

export interface HeaderRule {
  fieldId: string;
  label: string;
  labels: string[];                           // anchor labels to search for (any match)
  readStrategy: ReadStrategy;
}

export interface TableColumn {
  id: string;
  label: string;
  anchorLabels: string[];                     // text in header row identifying this column
}

export interface TableRule {
  id: string;
  title: string;
  sheetNames: string[];                       // which sheets to search
  rowAnchorLabels: string[];                  // find row containing these (subset triggers)
  columns: TableColumn[];
  maxEmpty: number;
  stopLabels?: string[];                      // stop reading when first col matches these (lowercase)
}

export interface KVTableRule {
  id: string;
  sheetNames: string[];
  labelCol: number;                           // column index for parameter name
  valueCol: number;                           // column index for parameter value
  skipLabels: string[];                       // skip rows where labelCol matches these
  stopLabels: string[];                       // stop when labelCol contains these
  startAfterLabel?: string;                   // start reading after this label appears
}

export interface ChangeHistoryRule {
  sheetNames: string[];
  dateLabelCol: number;                       // column containing "Datum:" label
  dateLabel: string;
  dateValueCol: number;                       // column with the actual date value
  authorCol: number;                          // column with author name
  descOffset: number;                         // row offset from anchor for description
  descCol: number;                            // column for description text
}

export interface MappingProfile {
  id: string;
  name: string;
  description: string;
  supportedSheetNames: string[];             // signature for auto-detection
  headerRules: HeaderRule[];
  tableRules: TableRule[];
  kvTableRules: KVTableRule[];
  changeHistoryRule: ChangeHistoryRule;
  identifierField: string;                   // fieldId that maps to the PLP identifier
  productNameField: string;
  revisionField: string;
}
