import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import type {
  MappingProfile,
  ImportPreview,
  ImportWarning,
  ExtractedField,
  ExtractedTable,
  ExtractedRow,
  ExtractedParameterTable,
  ExtractedParameter,
  ExtractedChangeEntry,
  SourceRef,
  ReadStrategy,
} from "./types";
import { detectProfile, NOMI_PLP_PROFILE } from "./profiles";

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function addr(r: number, c: number): string {
  return XLSX.utils.encode_cell({ r, c });
}

function cellText(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const cell = sheet[addr(r, c)];
  if (!cell) return "";
  // For dates, use formatted text; for others use raw value
  const raw = cell.v;
  if (raw === undefined || raw === null) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).trim();
}

function getRange(sheet: XLSX.WorkSheet): XLSX.Range {
  return XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
}

// ─── Anchor search ────────────────────────────────────────────────────────────

interface AnchorMatch {
  r: number;
  c: number;
  text: string;
  matched: string;
}

/**
 * Find all cells whose text matches any of the given labels (case-insensitive exact or prefix match).
 * Returns earliest row matches first.
 */
function findAnchors(
  sheet: XLSX.WorkSheet,
  labels: string[],
  searchCol?: number
): AnchorMatch[] {
  const range = getRange(sheet);
  const lowerLabels = labels.map(l => l.toLowerCase().trim());
  const results: AnchorMatch[] = [];
  const cStart = searchCol != null ? searchCol : range.s.c;
  const cEnd   = searchCol != null ? searchCol : range.e.c;

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = cStart; c <= cEnd; c++) {
      const text = cellText(sheet, r, c).toLowerCase();
      for (let i = 0; i < lowerLabels.length; i++) {
        const label = lowerLabels[i];
        if (text === label || text.startsWith(label)) {
          results.push({ r, c, text: cellText(sheet, r, c), matched: labels[i] });
          break;
        }
      }
    }
  }
  return results;
}

// ─── Header field extraction ──────────────────────────────────────────────────

function readValue(
  sheet: XLSX.WorkSheet,
  anchorR: number,
  anchorC: number,
  strategy: ReadStrategy,
  range: XLSX.Range
): { value: string; cellRef: string } {
  switch (strategy.type) {
    case "below": {
      const r = anchorR + 1;
      const c = anchorC;
      return { value: cellText(sheet, r, c), cellRef: addr(r, c) };
    }
    case "right": {
      const r = anchorR;
      const c = anchorC + 1;
      return { value: cellText(sheet, r, c), cellRef: addr(r, c) };
    }
    case "fixed-col": {
      const r = anchorR;
      const c = strategy.col;
      return { value: cellText(sheet, r, c), cellRef: addr(r, c) };
    }
    case "scan-row": {
      // Collect all non-empty values in the same row, skipping the anchor col
      const r = anchorR;
      const vals: string[] = [];
      const cells: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (c === anchorC) continue;
        const v = cellText(sheet, r, c);
        if (v) { vals.push(v); cells.push(addr(r, c)); }
      }
      return { value: vals.join(", "), cellRef: cells.join(",") };
    }
  }
}

function extractHeaders(
  sheets: Record<string, XLSX.WorkSheet>,
  sheetNames: string[],
  profile: MappingProfile
): { fields: ExtractedField[]; warnings: ImportWarning[] } {
  const fields: ExtractedField[] = [];
  const warnings: ImportWarning[] = [];

  for (const rule of profile.headerRules) {
    let found = false;

    for (const sheetName of sheetNames) {
      const sheet = sheets[sheetName];
      if (!sheet) continue;
      const range = getRange(sheet);
      const anchors = findAnchors(sheet, rule.labels);
      if (anchors.length === 0) continue;

      const anchor = anchors[0];
      const { value, cellRef } = readValue(sheet, anchor.r, anchor.c, rule.readStrategy, range);

      const sourceRef: SourceRef = {
        sheet: sheetName,
        cell: cellRef,
        label: anchor.text,
      };

      fields.push({
        fieldId: rule.fieldId,
        label: rule.label,
        value,
        sourceRef,
      });

      if (!value) {
        warnings.push({
          severity: "warning",
          message: `Field "${rule.label}" found but value is empty`,
          field: rule.fieldId,
          sourceRef,
        });
      }

      found = true;
      break; // found in first matching sheet
    }

    if (!found) {
      warnings.push({
        severity: "info",
        message: `Field "${rule.label}" not found in any sheet`,
        field: rule.fieldId,
      });
    }
  }

  return { fields, warnings };
}

// ─── Table extraction ─────────────────────────────────────────────────────────

function extractTables(
  sheets: Record<string, XLSX.WorkSheet>,
  sheetNames: string[],
  profile: MappingProfile
): { tables: ExtractedTable[]; warnings: ImportWarning[] } {
  const tables: ExtractedTable[] = [];
  const warnings: ImportWarning[] = [];

  for (const rule of profile.tableRules) {
    // Find first matching sheet
    const targetSheet = rule.sheetNames.find(s => sheetNames.includes(s));
    if (!targetSheet) {
      warnings.push({ severity: "info", message: `Sheet not found for table "${rule.title}"` });
      continue;
    }

    const sheet = sheets[targetSheet];
    if (!sheet) continue;
    const range = getRange(sheet);

    // Find the header row: a row containing at least 2 of the rowAnchorLabels
    const lowerAnchors = rule.rowAnchorLabels.map(l => l.toLowerCase().trim());
    let headerR = -1;
    const colPositions: Record<string, number> = {};

    for (let r = range.s.r; r <= range.e.r; r++) {
      const matched: string[] = [];
      const positions: Record<string, number> = {};
      for (let c = range.s.c; c <= range.e.c; c++) {
        const t = cellText(sheet, r, c).toLowerCase();
        for (const anchor of lowerAnchors) {
          if (t === anchor || t.startsWith(anchor)) {
            matched.push(anchor);
            positions[anchor] = c;
          }
        }
      }
      if (matched.length >= 2) {
        headerR = r;
        Object.assign(colPositions, positions);
        break;
      }
    }

    if (headerR === -1) {
      warnings.push({
        severity: "info",
        message: `Header row not found for table "${rule.title}" in sheet "${targetSheet}"`,
      });
      continue;
    }

    // Resolve column positions for each defined column
    const resolvedCols: { id: string; label: string; col: number }[] = [];
    for (const col of rule.columns) {
      let colIdx = -1;
      for (const anchorLabel of col.anchorLabels) {
        const lower = anchorLabel.toLowerCase().trim();
        if (colPositions[lower] != null) {
          colIdx = colPositions[lower];
          break;
        }
        // fallback: search the header row directly
        for (let c = range.s.c; c <= range.e.c; c++) {
          const t = cellText(sheet, headerR, c).toLowerCase();
          if (t === lower || t.startsWith(lower)) {
            colIdx = c;
            break;
          }
        }
        if (colIdx !== -1) break;
      }
      if (colIdx !== -1) {
        resolvedCols.push({ id: col.id, label: col.label, col: colIdx });
      }
    }

    if (resolvedCols.length === 0) {
      warnings.push({ severity: "warning", message: `No columns resolved for table "${rule.title}"` });
      continue;
    }

    const headerRef: SourceRef = {
      sheet: targetSheet,
      range: addr(headerR, resolvedCols[0]?.col) + ":" + addr(headerR, resolvedCols[resolvedCols.length - 1]?.col),
      label: `Header row ${headerR + 1}`,
    };

    // Extract data rows
    const rows: ExtractedRow[] = [];
    let emptyCount = 0;
    const firstCol = resolvedCols[0];
    const lowerStop = (rule.stopLabels ?? []).map(s => s.toLowerCase());

    for (let r = headerR + 1; r <= range.e.r; r++) {
      const anchor = cellText(sheet, r, firstCol.col);
      if (!anchor) {
        emptyCount++;
        if (emptyCount >= rule.maxEmpty) break;
        continue;
      }
      // Stop at section markers
      if (lowerStop.some(s => anchor.toLowerCase().startsWith(s))) break;
      emptyCount = 0;

      const values: Record<string, string> = {};
      for (const col of resolvedCols) {
        values[col.id] = cellText(sheet, r, col.col);
      }

      rows.push({
        rowIndex: r,
        values,
        sourceRef: {
          sheet: targetSheet,
          range: addr(r, resolvedCols[0].col) + ":" + addr(r, resolvedCols[resolvedCols.length - 1].col),
        },
      });
    }

    if (rows.length > 0) {
      tables.push({
        id: rule.id,
        title: rule.title,
        sheetName: targetSheet,
        columns: resolvedCols.map(c => ({ id: c.id, label: c.label })),
        rows,
        headerRef,
      });
    }
  }

  return { tables, warnings };
}

// ─── Key-value parameter table extraction ─────────────────────────────────────

function extractKVTables(
  sheets: Record<string, XLSX.WorkSheet>,
  sheetNames: string[],
  profile: MappingProfile
): { parameterTables: ExtractedParameterTable[]; warnings: ImportWarning[] } {
  const parameterTables: ExtractedParameterTable[] = [];
  const warnings: ImportWarning[] = [];

  for (const rule of profile.kvTableRules) {
    const targetSheet = rule.sheetNames.find(s => sheetNames.includes(s));
    if (!targetSheet) continue;

    const sheet = sheets[targetSheet];
    if (!sheet) continue;
    const range = getRange(sheet);

    const lowerSkip = rule.skipLabels.map(l => l.toLowerCase());
    const lowerStop = rule.stopLabels.map(l => l.toLowerCase());
    const startAfter = rule.startAfterLabel?.toLowerCase();

    let active = !startAfter; // if no startAfter, start immediately
    const params: ExtractedParameter[] = [];

    for (let r = range.s.r; r <= range.e.r; r++) {
      const labelCell = cellText(sheet, r, rule.labelCol).toLowerCase().trim();

      if (!active) {
        if (startAfter && (labelCell === startAfter || labelCell.includes(startAfter))) {
          active = true;
          // fall through — include this row (the startAfterLabel row itself)
        } else {
          continue;
        }
      }

      if (!labelCell) continue;
      if (lowerStop.some(s => labelCell.includes(s))) break;
      if (lowerSkip.some(s => labelCell.startsWith(s))) continue;

      const rawLabel = cellText(sheet, r, rule.labelCol);
      const rawValue = cellText(sheet, r, rule.valueCol);

      if (!rawLabel || !rawValue) continue;

      params.push({
        id: randomUUID(),
        name: rawLabel,
        value: rawValue,
        unit: "",
        min: "",
        max: "",
        isLocked: false,
        isCritical: false,
        sourceRef: {
          sheet: targetSheet,
          range: addr(r, rule.labelCol) + ":" + addr(r, rule.valueCol),
          label: rawLabel,
        },
      });
    }

    if (params.length > 0) {
      parameterTables.push({
        id: rule.id,
        sheetName: targetSheet,
        parameters: params,
      });
    } else {
      warnings.push({ severity: "info", message: `No KV parameters found in sheet "${targetSheet}"` });
    }
  }

  return { parameterTables, warnings };
}

// ─── Change history extraction ────────────────────────────────────────────────

function extractChangeHistory(
  sheets: Record<string, XLSX.WorkSheet>,
  sheetNames: string[],
  profile: MappingProfile
): ExtractedChangeEntry[] {
  const rule = profile.changeHistoryRule;
  const targetSheet = rule.sheetNames.find(s => sheetNames.includes(s));
  if (!targetSheet) return [];

  const sheet = sheets[targetSheet];
  if (!sheet) return [];
  const range = getRange(sheet);

  const entries: ExtractedChangeEntry[] = [];
  const lowerLabel = rule.dateLabel.toLowerCase();

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cell = cellText(sheet, r, rule.dateLabelCol).toLowerCase().trim();
    if (cell !== lowerLabel) continue;

    // Read date
    const rawDate = cellText(sheet, r, rule.dateValueCol);
    let date = rawDate;
    // Parse date objects stored as ISO strings or Excel date serials
    if (rawDate && rawDate.includes("GMT")) {
      try {
        date = new Date(rawDate).toISOString().slice(0, 10);
      } catch {
        date = rawDate;
      }
    }

    const author = cellText(sheet, r, rule.authorCol);
    const description = cellText(sheet, r + rule.descOffset, rule.descCol);

    if (!date && !description) continue;

    entries.push({
      num: entries.length + 1,
      date,
      author,
      description,
      sourceRef: {
        sheet: targetSheet,
        range: addr(r, rule.dateLabelCol) + ":" + addr(r + rule.descOffset, rule.descCol),
      },
    });
  }

  return entries;
}

// ─── Main parse function ──────────────────────────────────────────────────────

export function parseExcel(
  buffer: Buffer,
  profileOverrideId?: string
): ImportPreview {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetNames = wb.SheetNames;

  // Build a sheet map
  const sheets: Record<string, XLSX.WorkSheet> = {};
  for (const name of sheetNames) {
    sheets[name] = wb.Sheets[name];
  }

  // Detect or select profile
  let profile = detectProfile(sheetNames);
  if (profileOverrideId) {
    // Could import PROFILES and find by id — for now just use NOMI if override matches
    if (profileOverrideId === NOMI_PLP_PROFILE.id) profile = NOMI_PLP_PROFILE;
  }
  if (!profile) {
    // Fall back to NOMI profile as default
    profile = NOMI_PLP_PROFILE;
  }

  const warnings: ImportWarning[] = [];

  // 1. Extract header fields
  const { fields, warnings: hw } = extractHeaders(sheets, sheetNames, profile);
  warnings.push(...hw);

  // 2. Extract ingredient tables
  const { tables, warnings: tw } = extractTables(sheets, sheetNames, profile);
  warnings.push(...tw);

  // 3. Extract KV parameter tables
  const { parameterTables, warnings: pw } = extractKVTables(sheets, sheetNames, profile);
  warnings.push(...pw);

  // 4. Extract change history
  const changeHistory = extractChangeHistory(sheets, sheetNames, profile);

  // 5. Derive key fields
  const identifier  = fields.find(f => f.fieldId === profile!.identifierField)?.value || null;
  const productName = fields.find(f => f.fieldId === profile!.productNameField)?.value || null;
  const revision    = fields.find(f => f.fieldId === profile!.revisionField)?.value || null;

  // 6. Validation errors
  if (!identifier) {
    warnings.push({
      severity: "error",
      message: `Identifier field "${profile.identifierField}" is missing or empty — cannot create guideline`,
      field: profile.identifierField,
    });
  }
  if (!productName) {
    warnings.push({
      severity: "error",
      message: `Product name field "${profile.productNameField}" is missing or empty`,
      field: profile.productNameField,
    });
  }

  return {
    profileId: profile.id,
    profileName: profile.name,
    sheetNames,
    fields,
    tables,
    parameterTables,
    changeHistory,
    warnings,
    identifier,
    productName,
    revision,
  };
}
