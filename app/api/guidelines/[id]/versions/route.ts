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
import { v4 as uuid } from "uuid";
import type { ContentJson } from "@/lib/types";

const SaveVersionSchema = z.object({
  contentJson: z.unknown(),
  versionStamp: z.string(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = SaveVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const store = readGuidelines();
  const guideline = store.guidelines.find((g) => g.id === id);
  if (!guideline) return NextResponse.json({ error: "Guideline not found" }, { status: 404 });

  // Find the DRAFT version
  const idx = store.versions.findIndex((v) => v.guidelineId === id && v.status === "DRAFT");
  if (idx === -1) return NextResponse.json({ error: "No draft version" }, { status: 404 });

  const existing = store.versions[idx];

  // Stale write check
  if (existing.versionStamp !== parsed.data.versionStamp) {
    return NextResponse.json(
      { error: "Stale write", code: "STALE_WRITE", current: existing.versionStamp },
      { status: 409 }
    );
  }

  // Resolve template schema for normalization
  const tStore = readTemplates();
  const tv = tStore.versions.find((v) => v.id === guideline.templateVersionId);
  const contentJson = parsed.data.contentJson as ContentJson;
  const normalizedPayload = tv
    ? normalizeContent(contentJson, tv.schemaJson)
    : { parameters: [] };

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
    action: "SAVED",
    userId: user.id,
    userName: user.name,
    createdAt: now,
  });

  return NextResponse.json({ version: store.versions[idx] });
}
