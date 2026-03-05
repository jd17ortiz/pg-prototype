import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readTemplates, writeTemplates, appendAudit, nowStamp, versionStamp } from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { v4 as uuid } from "uuid";

const CreateTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = readTemplates();
  return NextResponse.json({ templates: store.templates, versions: store.versions });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const store = readTemplates();
  const now = nowStamp();
  const templateId = uuid();

  const template = {
    id: templateId,
    name: parsed.data.name,
    description: parsed.data.description,
    createdAt: now,
    updatedAt: now,
  };

  const version = {
    id: uuid(),
    templateId,
    versionNumber: 1,
    status: "DRAFT" as const,
    schemaJson: { headerFields: [], sheets: [] },
    createdAt: now,
    updatedAt: now,
    versionStamp: versionStamp(),
  };

  store.templates.push(template);
  store.versions.push(version);
  writeTemplates(store);

  appendAudit({
    id: uuid(),
    entityType: "Template",
    entityId: templateId,
    action: "CREATED",
    userId: user.id,
    userName: user.name,
    data: { name: template.name },
    createdAt: now,
  });

  return NextResponse.json({ template, version }, { status: 201 });
}
