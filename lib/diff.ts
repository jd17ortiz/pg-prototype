import type {
  GuidelineVersion,
  TemplateSchema,
  DiffResult,
  DiffEntry,
  NormalizedParameter,
  ContentJson,
} from "./types";

function paramKey(p: NormalizedParameter) {
  return `${p.sectionId}::${p.name}`;
}

function path(...parts: string[]) {
  return parts.filter(Boolean).join(" / ");
}

/** Compute a structured diff between two guideline versions */
export function computeDiff(
  vA: GuidelineVersion,
  vB: GuidelineVersion,
  schema: TemplateSchema
): DiffResult {
  const entries: DiffEntry[] = [];

  // ─── 1. Parameter diff (from normalizedPayload) ──────────────────────────
  const paramsA = vA.normalizedPayload.parameters;
  const paramsB = vB.normalizedPayload.parameters;

  const mapA = new Map(paramsA.map((p) => [paramKey(p), p]));
  const mapB = new Map(paramsB.map((p) => [paramKey(p), p]));

  // Added params (in B, not in A)
  for (const [k, pb] of mapB) {
    if (!mapA.has(k)) {
      entries.push({
        type: "added",
        path: path(pb.sheetName, pb.sectionTitle, pb.name),
        label: `Added parameter "${pb.name}" (${pb.value} ${pb.unit})`,
        newValue: `${pb.value} ${pb.unit} [${pb.min}–${pb.max}]`,
      });
    }
  }

  // Removed params (in A, not in B)
  for (const [k, pa] of mapA) {
    if (!mapB.has(k)) {
      entries.push({
        type: "removed",
        path: path(pa.sheetName, pa.sectionTitle, pa.name),
        label: `Removed parameter "${pa.name}"`,
        oldValue: `${pa.value} ${pa.unit} [${pa.min}–${pa.max}]`,
      });
    }
  }

  // Changed params
  const PARAM_FIELDS: Array<keyof NormalizedParameter> = [
    "value", "unit", "min", "max", "isLocked", "isCritical",
  ];
  for (const [k, pa] of mapA) {
    const pb = mapB.get(k);
    if (!pb) continue;
    for (const field of PARAM_FIELDS) {
      const va = String(pa[field]);
      const vb = String(pb[field]);
      if (va !== vb) {
        entries.push({
          type: "changed",
          path: path(pa.sheetName, pa.sectionTitle, pa.name),
          field,
          label: `Changed "${pa.name}" ${field}: ${va} → ${vb}`,
          oldValue: va,
          newValue: vb,
        });
      }
    }
  }

  // ─── 2. Header field diff ────────────────────────────────────────────────
  const hvA = vA.contentJson.headerValues ?? {};
  const hvB = vB.contentJson.headerValues ?? {};
  for (const hf of schema.headerFields) {
    const a = hvA[hf.id] ?? "";
    const b = hvB[hf.id] ?? "";
    if (a !== b) {
      entries.push({
        type: "changed",
        path: path("Header", hf.label),
        field: hf.label,
        label: `Header "${hf.label}": "${a}" → "${b}"`,
        oldValue: a,
        newValue: b,
      });
    }
  }

  // ─── 3. Sheet/section content diff ──────────────────────────────────────
  for (const sheet of schema.sheets) {
    const sheetA = vA.contentJson.sheets[sheet.id];
    const sheetB = vB.contentJson.sheets[sheet.id];

    for (const sec of sheet.sections) {
      const secA = sheetA?.sections[sec.id];
      const secB = sheetB?.sections[sec.id];

      if (!secA || !secB) continue;

      if (secA.type === "richText" && secB.type === "richText") {
        if (secA.html !== secB.html) {
          entries.push({
            type: "changed",
            path: path(sheet.name, sec.title),
            label: `Rich text changed in "${sec.title}"`,
            oldValue: stripHtml(secA.html).slice(0, 80),
            newValue: stripHtml(secB.html).slice(0, 80),
          });
        }
      }

      if (secA.type === "fieldGrid" && secB.type === "fieldGrid") {
        for (const field of sec.config.fields ?? []) {
          const a = secA.values[field.id] ?? "";
          const b = secB.values[field.id] ?? "";
          if (a !== b) {
            entries.push({
              type: "changed",
              path: path(sheet.name, sec.title, field.label),
              field: field.label,
              label: `Field "${field.label}": "${a}" → "${b}"`,
              oldValue: a,
              newValue: b,
            });
          }
        }
      }

      if (secA.type === "table" && secB.type === "table") {
        const ra = secA.rows.length;
        const rb = secB.rows.length;
        if (ra !== rb) {
          entries.push({
            type: "changed",
            path: path(sheet.name, sec.title),
            label: `Table row count: ${ra} → ${rb}`,
            oldValue: String(ra),
            newValue: String(rb),
          });
        }
        // Compare existing rows by index
        const minLen = Math.min(ra, rb);
        for (let i = 0; i < minLen; i++) {
          for (const col of sec.config.columns ?? []) {
            const a = secA.rows[i][col.id] ?? "";
            const b = secB.rows[i][col.id] ?? "";
            if (a !== b) {
              entries.push({
                type: "changed",
                path: path(sheet.name, sec.title, `Row ${i + 1}`, col.label),
                field: col.label,
                label: `Table "${sec.title}" row ${i + 1} "${col.label}": "${a}" → "${b}"`,
                oldValue: a,
                newValue: b,
              });
            }
          }
        }
      }
    }
  }

  const summary = {
    added: entries.filter((e) => e.type === "added").length,
    removed: entries.filter((e) => e.type === "removed").length,
    changed: entries.filter((e) => e.type === "changed").length,
  };

  return {
    hasChanges: entries.length > 0,
    summary,
    entries,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Diff helper: compare single content with a base (for approver view) */
export function diffSummaryLabel(diff: DiffResult): string {
  if (!diff.hasChanges) return "No changes detected";
  const parts: string[] = [];
  if (diff.summary.added) parts.push(`+${diff.summary.added} added`);
  if (diff.summary.removed) parts.push(`-${diff.summary.removed} removed`);
  if (diff.summary.changed) parts.push(`${diff.summary.changed} changed`);
  return parts.join(", ");
}
