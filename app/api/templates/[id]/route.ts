import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readTemplates, writeTemplates, appendAudit, nowStamp } from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { v4 as uuid } from "uuid";

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const store = readTemplates();
  const template = store.templates.find((t) => t.id === id);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = store.versions.filter((v) => v.templateId === id);
  return NextResponse.json({ template, versions });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const store = readTemplates();
  const idx = store.templates.findIndex((t) => t.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = nowStamp();
  store.templates[idx] = { ...store.templates[idx], ...parsed.data, updatedAt: now };
  writeTemplates(store);

  appendAudit({
    id: uuid(),
    entityType: "Template",
    entityId: id,
    action: "UPDATED",
    userId: user.id,
    userName: user.name,
    data: parsed.data,
    createdAt: now,
  });

  return NextResponse.json({ template: store.templates[idx] });
}
