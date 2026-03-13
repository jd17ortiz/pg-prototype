import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  readGuidelines, writeGuidelines,
  readTemplates, readImports, writeImports,
  appendAudit, nowStamp, versionStamp,
  UPLOADS_DIR,
} from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { emptyContent, normalizeContent } from "@/lib/normalize";
import { ensureTemplate } from "@/lib/templatePresets";
import { PROFILES } from "@/lib/migration/profiles";
import type {
  ContentJson, TemplateSchema, ChangeHistoryEntry, MediaFile, ParameterRow,
} from "@/lib/types";
import type { ImportPreview } from "@/lib/migration/types";

// ─── Sheet keyword helper ─────────────────────────────────────────────────────
// Returns the first "meaningful" word (≥4 chars) from a sheet name, lowercased.
// Used to match template sheet names against extracted-data sheet names.

function sheetKeyword(name: string): string {
  const words = name.toLowerCase().split(/[\s\/\-_]+/);
  return words.find(w => w.length >= 4) ?? words[0] ?? name.toLowerCase();
}

// ─── Build contentJson from a parsed ImportPreview + template schema ──────────

function buildContentJson(
  preview: ImportPreview,
  schema: TemplateSchema,
  excelFileId: string,
  excelFilename: string,
  excelSize: number,
): ContentJson {
  const content = emptyContent(schema);

  // 1. Header values
  for (const field of preview.fields) {
    if (field.fieldId in content.headerValues) {
      content.headerValues[field.fieldId] = field.value;
    }
  }

  // 2. Per-sheet / per-section content
  for (const sheet of schema.sheets) {
    const sheetKey = sheetKeyword(sheet.name);
    const sheetContent = content.sheets[sheet.id];
    if (!sheetContent) continue;

    for (const section of sheet.sections) {
      const sectionContent = sheetContent.sections[section.id];
      if (!sectionContent) continue;

      switch (section.type) {
        // ── fieldGrid — populate from extracted header fields ──────────────
        case "fieldGrid": {
          const fg = sectionContent as { type: "fieldGrid"; values: Record<string, string> };
          for (const field of preview.fields) {
            if (field.fieldId in fg.values) {
              fg.values[field.fieldId] = field.value;
            }
          }
          break;
        }

        // ── table — map ExtractedTable rows directly ───────────────────────
        // Match by: extracted table ID prefix vs template sheet ID (most
        // reliable for bilingual files), then fall back to sheet name keyword.
        case "table": {
          const matchingTable = preview.tables.find(t => {
            const tablePrefix = t.id.split("-")[0]; // "impf" from "impf-ingredients"
            return (
              sheet.id.includes(tablePrefix) ||
              t.sheetName.toLowerCase().includes(sheetKey) ||
              sheetKey.includes(sheetKeyword(t.sheetName))
            );
          });
          if (matchingTable) {
            (sectionContent as { type: "table"; rows: Record<string, string>[] }).rows =
              matchingTable.rows.map(r => r.values);
          }
          break;
        }

        // ── parameterTable — KV params from matching sheet ─────────────────
        case "parameterTable": {
          const matchingPT = preview.parameterTables.find(pt => {
            const ptPrefix = pt.id.split("-")[0]; // "konz" from "konz-params"
            return (
              sheet.id.includes(ptPrefix) ||
              pt.sheetName.toLowerCase().includes(sheetKey) ||
              sheetKey.includes(sheetKeyword(pt.sheetName))
            );
          });
          if (matchingPT) {
            (sectionContent as { type: "parameterTable"; rows: ParameterRow[] }).rows =
              matchingPT.parameters.map(p => ({
                id: randomUUID(),
                name: p.name,
                value: p.value,
                unit: p.unit,
                min: p.min,
                max: p.max,
                isLocked: p.isLocked,
                isCritical: p.isCritical,
              }));
          }
          break;
        }

        // ── changeHistory — all entries ────────────────────────────────────
        case "changeHistory": {
          const entries: ChangeHistoryEntry[] = preview.changeHistory.map(e => ({
            id: randomUUID(),
            date: e.date,
            author: e.author,
            description: e.description,
            version: String(e.num),
          }));
          (sectionContent as { type: "changeHistory"; entries: ChangeHistoryEntry[] }).entries =
            entries;
          break;
        }

        // ── media — attach source Excel in first empty media section ───────
        case "media": {
          const ms = sectionContent as { type: "media"; files: MediaFile[] };
          if (ms.files.length === 0) {
            ms.files.push({
              id: randomUUID(),
              fileName: excelFilename,
              fileType: "application/vnd.ms-excel.sheet.macroEnabled.12",
              size: excelSize,
              uploadedAt: nowStamp(),
              description: "Source Excel (import)",
              fileId: excelFileId,
            });
          }
          break;
        }

        // ── richText — migration note for import-notes sections ────────────
        case "richText": {
          const sc = sectionContent as { type: "richText"; html: string };
          if (!sc.html) {
            const isImportNotes =
              section.title.toLowerCase().includes("importnotiz") ||
              section.title.toLowerCase().includes("import note") ||
              section.id.includes("quel-notes");
            if (isImportNotes) {
              sc.html =
                `<p><em>Draft imported from <strong>${excelFilename}</strong> ` +
                `via Migration Studio. Review and correct all sections before ` +
                `submitting for approval.</em></p>`;
            }
          }
          break;
        }
      }
    }
  }

  return content;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    runId: string;
    siteId: string;
    templateVersionId?: string;
    customName?: string;
  };

  const { runId, siteId, customName } = body;
  let { templateVersionId } = body;

  if (!runId || !siteId) {
    return NextResponse.json({ error: "runId and siteId required" }, { status: 400 });
  }

  // Load import run
  const importsStore = readImports();
  const run = importsStore.runs.find(r => r.id === runId);
  if (!run) {
    return NextResponse.json({ error: "Import run not found" }, { status: 404 });
  }

  const preview: ImportPreview = run.preview;

  // Validate required fields
  const hasErrors = preview.warnings.some(w => w.severity === "error");
  if (hasErrors) {
    return NextResponse.json(
      { error: "Cannot create draft — fix errors first", warnings: preview.warnings },
      { status: 422 }
    );
  }

  if (!preview.identifier) {
    return NextResponse.json({ error: "Identifier missing from preview" }, { status: 422 });
  }

  // Auto-resolve template if not provided
  if (!templateVersionId) {
    templateVersionId = run.templateVersionId || undefined;
  }
  if (!templateVersionId) {
    const prof = PROFILES.find(p => p.id === preview.profileId);
    if (prof?.templateFamily) {
      const ensured = ensureTemplate(prof.templateFamily);
      if (ensured) templateVersionId = ensured.templateVersionId;
    }
  }
  if (!templateVersionId) {
    return NextResponse.json({ error: "templateVersionId required (or profileId must map to a known template family)" }, { status: 400 });
  }

  // Load template version
  const tplStore = readTemplates();
  const tv = tplStore.versions.find(v => v.id === templateVersionId);
  if (!tv) {
    return NextResponse.json({ error: "Template version not found" }, { status: 404 });
  }

  const schema: TemplateSchema = tv.schemaJson;

  // Idempotency: check for existing guideline with same identifier + siteId
  const glStore = readGuidelines();
  const identifier = `PLP-${preview.identifier}`;
  const existingGl = glStore.guidelines.find(
    g => g.identifier === identifier && g.siteId === siteId
  );

  const now = nowStamp();
  const guidelineId = existingGl?.id ?? randomUUID();

  const existingVersions = glStore.versions.filter(v => v.guidelineId === guidelineId);
  const nextVersionNumber = existingVersions.length > 0
    ? Math.max(...existingVersions.map(v => v.versionNumber)) + 1
    : 1;

  // Guard: no two DRAFTs at once
  const hasDraft = existingVersions.some(v => v.status === "DRAFT");
  if (hasDraft) {
    const draft = existingVersions.find(v => v.status === "DRAFT")!;
    return NextResponse.json(
      {
        error: "This guideline already has an open DRAFT. Review or submit it before importing again.",
        existingDraftVersionId: draft.id,
        guidelineId,
      },
      { status: 409 }
    );
  }

  // Get file size
  const fs = await import("fs");
  const path = await import("path");
  let excelSize = 0;
  try {
    const stat = fs.statSync(path.join(UPLOADS_DIR, run.fileId));
    excelSize = stat.size;
  } catch {
    // ignore
  }

  // Build content
  const contentJson = buildContentJson(
    preview,
    schema,
    run.fileId,
    run.filename,
    excelSize,
  );
  const normalizedPayload = normalizeContent(contentJson, schema);

  // Guideline name
  const guidelineName = customName
    || `PLP ${preview.identifier} – ${preview.productName ?? "Imported"}`;

  // Create or update guideline record
  if (!existingGl) {
    glStore.guidelines.push({
      id: guidelineId,
      name: guidelineName,
      type: "LOCAL",
      siteId,
      templateVersionId,
      createdAt: now,
      updatedAt: now,
      identifier,
    });
  } else {
    const idx = glStore.guidelines.findIndex(g => g.id === guidelineId);
    if (idx !== -1) glStore.guidelines[idx].updatedAt = now;
  }

  // Create draft version
  const versionId = randomUUID();
  glStore.versions.push({
    id: versionId,
    guidelineId,
    versionNumber: nextVersionNumber,
    status: "DRAFT",
    contentJson,
    normalizedPayload,
    reasonForChange: `Imported from Excel: ${run.filename} (Rev. ${preview.revision ?? "?"})`,
    authorId: user.id,
    createdAt: now,
    updatedAt: now,
    versionStamp: versionStamp(),
  });

  writeGuidelines(glStore);

  // Update import run
  run.resultGuidelineId = guidelineId;
  run.resultVersionId = versionId;
  run.templateVersionId = templateVersionId;
  writeImports(importsStore);

  // Audit events
  const actionPrefix = existingGl ? "NEW_VERSION" : "CREATED";
  appendAudit({
    id: randomUUID(),
    entityType: "Guideline",
    entityId: guidelineId,
    action: `IMPORT_${actionPrefix}`,
    userId: user.id,
    userName: user.name,
    data: {
      source: run.filename,
      profileId: preview.profileId,
      identifier,
      versionNumber: nextVersionNumber,
    },
    createdAt: now,
  });
  appendAudit({
    id: randomUUID(),
    entityType: "GuidelineVersion",
    entityId: versionId,
    action: "DRAFT_CREATED_FROM_IMPORT",
    userId: user.id,
    userName: user.name,
    data: { importRunId: runId, filename: run.filename },
    createdAt: now,
  });

  return NextResponse.json({
    guidelineId,
    versionId,
    versionNumber: nextVersionNumber,
    guidelineName,
    isNew: !existingGl,
  }, { status: 201 });
}
