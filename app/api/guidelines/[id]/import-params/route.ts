import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  readGuidelines,
  writeGuidelines,
  readTemplates,
  appendAudit,
  nowStamp,
  versionStamp,
} from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { normalizeContent } from "@/lib/normalize";
import { validateLockConstraints } from "@/lib/locks";
import { v4 as uuid } from "uuid";
import type { ParameterRow, ContentJson } from "@/lib/types";

const ImportSchema = z.object({
  sheetId: z.string().min(1),
  sectionId: z.string().min(1),
  rows: z.array(z.object({
    name: z.string(),
    value: z.string(),
    unit: z.string(),
    min: z.string(),
    max: z.string(),
    isLocked: z.boolean(),
    isCritical: z.boolean(),
  })),
  versionStamp: z.string(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const store = readGuidelines();
  const guideline = store.guidelines.find((g) => g.id === id);
  if (!guideline) return NextResponse.json({ error: "Guideline not found" }, { status: 404 });

  const idx = store.versions.findIndex((v) => v.guidelineId === id && v.status === "DRAFT");
  if (idx === -1) return NextResponse.json({ error: "No draft version" }, { status: 404 });

  const existing = store.versions[idx];

  if (existing.versionStamp !== parsed.data.versionStamp) {
    return NextResponse.json(
      { error: "Stale write", code: "STALE_WRITE", current: existing.versionStamp },
      { status: 409 }
    );
  }

  const { sheetId, sectionId, rows } = parsed.data;
  const newRows: ParameterRow[] = rows.map((r) => ({ id: uuid(), ...r }));

  // Merge into contentJson
  const contentJson: ContentJson = structuredClone(existing.contentJson);
  if (!contentJson.sheets[sheetId]) {
    contentJson.sheets[sheetId] = { sections: {} };
  }
  const existing_section = contentJson.sheets[sheetId].sections[sectionId];
  if (existing_section && existing_section.type === "parameterTable") {
    // Append (avoid duplicates by name)
    const existingNames = new Set(existing_section.rows.map((r) => r.name));
    const toAdd = newRows.filter((r) => !existingNames.has(r.name));
    contentJson.sheets[sheetId].sections[sectionId] = {
      type: "parameterTable",
      rows: [...existing_section.rows, ...toAdd],
    };
  } else {
    contentJson.sheets[sheetId].sections[sectionId] = {
      type: "parameterTable",
      rows: newRows,
    };
  }

  const tStore = readTemplates();
  const tv = tStore.versions.find((v) => v.id === guideline.templateVersionId);
  const normalizedPayload = tv ? normalizeContent(contentJson, tv.schemaJson) : { parameters: [] };

  // Lock constraint check
  if (guideline.type === "CHILD" && guideline.parentActiveVersionId) {
    const parentVersion = store.versions.find((v) => v.id === guideline.parentActiveVersionId);
    if (parentVersion) {
      const violations = validateLockConstraints(
        normalizedPayload.parameters,
        parentVersion.normalizedPayload.parameters
      );
      if (violations.length > 0) {
        return NextResponse.json({ error: "Lock constraint violations", violations }, { status: 422 });
      }
    }
  }

  const now = nowStamp();
  store.versions[idx] = {
    ...existing,
    contentJson,
    normalizedPayload,
    updatedAt: now,
    versionStamp: versionStamp(),
  };
  writeGuidelines(store);

  appendAudit({
    id: uuid(),
    entityType: "GuidelineVersion",
    entityId: existing.id,
    action: "PARAMS_IMPORTED",
    userId: user.id,
    userName: user.name,
    data: { count: newRows.length, sheetId, sectionId },
    createdAt: now,
  });

  return NextResponse.json({ version: store.versions[idx], imported: newRows.length });
}
