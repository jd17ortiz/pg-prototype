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
import type { ContentJson, TemplateSchema, ChangeHistoryEntry, MediaFile } from "@/lib/types";
import type { ImportPreview, ExtractedTable } from "@/lib/migration/types";

// ─── Build contentJson from a parsed ImportPreview + template schema ──────────

function buildContentJson(
  preview: ImportPreview,
  schema: TemplateSchema,
  excelFileId: string,
  excelFilename: string,
  excelSize: number,
): ContentJson {
  const content = emptyContent(schema);

  // 1. Header values — match by fieldId
  for (const field of preview.fields) {
    if (field.fieldId in content.headerValues) {
      content.headerValues[field.fieldId] = field.value;
    }
  }

  // 2. For each sheet in the template, find matching extracted data by name similarity
  for (const sheet of schema.sheets) {
    const sheetNameLower = sheet.name.toLowerCase();
    const sheetContent = content.sheets[sheet.id];
    if (!sheetContent) continue;

    for (const section of sheet.sections) {
      const sectionContent = sheetContent.sections[section.id];
      if (!sectionContent) continue;

      switch (section.type) {
        case "richText": {
          // Find tables whose sheetName matches this template sheet
          const matchingTables = preview.tables.filter(t =>
            t.sheetName.toLowerCase().includes(sheetNameLower.split(" ")[0]) ||
            sheetNameLower.includes(t.sheetName.split(" ")[0]?.toLowerCase() ?? "")
          );
          if (matchingTables.length > 0) {
            (sectionContent as { type: "richText"; html: string }).html =
              tablesToHtml(matchingTables);
          }
          break;
        }

        case "parameterTable": {
          // Find KV parameter tables whose sheetName matches
          const matchingPT = preview.parameterTables.find(pt =>
            pt.sheetName.toLowerCase().includes(sheetNameLower.split(" ")[0]) ||
            sheetNameLower.includes(pt.sheetName.split(" ")[0]?.toLowerCase() ?? "")
          );
          if (matchingPT) {
            (sectionContent as { type: "parameterTable"; rows: unknown[] }).rows =
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

        case "changeHistory": {
          const entries: ChangeHistoryEntry[] = preview.changeHistory.map(e => ({
            id: randomUUID(),
            date: e.date,
            author: e.author,
            description: e.description,
            version: String(e.num),
          }));
          (sectionContent as { type: "changeHistory"; entries: ChangeHistoryEntry[] }).entries = entries;
          break;
        }

        case "media": {
          // Attach the source Excel file in the first media section encountered
          const mediaSection = sectionContent as { type: "media"; files: MediaFile[] };
          if (mediaSection.files.length === 0) {
            const mf: MediaFile = {
              id: randomUUID(),
              fileName: excelFilename,
              fileType: "application/vnd.ms-excel.sheet.macroEnabled.12",
              size: excelSize,
              uploadedAt: nowStamp(),
              description: "Source Excel (import)",
              fileId: excelFileId,
            };
            mediaSection.files.push(mf);
          }
          break;
        }
      }
    }
  }

  return content;
}

function tablesToHtml(tables: ExtractedTable[]): string {
  return tables.map(t => {
    const header = t.columns.map(c => `<th>${c.label}</th>`).join("");
    const rows = t.rows.map(r => {
      const cells = t.columns.map(c => `<td>${r.values[c.id] ?? ""}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<p><strong>${t.title}</strong></p><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join("\n");
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
    templateVersionId: string;
    customName?: string;
  };

  const { runId, siteId, templateVersionId, customName } = body;
  if (!runId || !siteId || !templateVersionId) {
    return NextResponse.json({ error: "runId, siteId, templateVersionId required" }, { status: 400 });
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

  // Determine next version number
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
    // Update updatedAt
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
