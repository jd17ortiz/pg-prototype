import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readTemplates, writeTemplates, appendAudit, nowStamp, versionStamp } from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import type { TemplateSchema } from "@/lib/types";

const SaveVersionSchema = z.object({
  schemaJson: z.unknown(),
  versionStamp: z.string(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const store = readTemplates();
  const versions = store.versions.filter((v) => v.templateId === id);
  return NextResponse.json({ versions });
}

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

  const store = readTemplates();
  const template = store.templates.find((t) => t.id === id);
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Find the draft version for this template
  const idx = store.versions.findIndex((v) => v.templateId === id && v.status === "DRAFT");
  if (idx === -1) return NextResponse.json({ error: "No draft version found" }, { status: 404 });

  const existing = store.versions[idx];

  // Stale write check
  if (existing.versionStamp !== parsed.data.versionStamp) {
    return NextResponse.json(
      { error: "Stale write", code: "STALE_WRITE", current: existing.versionStamp },
      { status: 409 }
    );
  }

  const now = nowStamp();
  store.versions[idx] = {
    ...existing,
    schemaJson: parsed.data.schemaJson as TemplateSchema,
    updatedAt: now,
    versionStamp: versionStamp(),
  };
  writeTemplates(store);

  appendAudit({
    id: uuid(),
    entityType: "TemplateVersion",
    entityId: existing.id,
    action: "SAVED",
    userId: user.id,
    userName: user.name,
    createdAt: now,
  });

  return NextResponse.json({ version: store.versions[idx] });
}
