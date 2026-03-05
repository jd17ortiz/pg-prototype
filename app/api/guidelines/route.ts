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
import { emptyContent } from "@/lib/normalize";
import { v4 as uuid } from "uuid";

const CreateGuidelineSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["PARENT", "LOCAL", "CHILD"]),
  siteId: z.string().min(1),
  parentGuidelineId: z.string().optional(),
  templateVersionId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  const type = searchParams.get("type");

  const store = readGuidelines();
  let guidelines = store.guidelines;

  if (siteId) guidelines = guidelines.filter((g) => g.siteId === siteId);
  if (type) guidelines = guidelines.filter((g) => g.type === type);

  return NextResponse.json({ guidelines, versions: store.versions, approvals: store.approvals });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = CreateGuidelineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, type, siteId, parentGuidelineId, templateVersionId } = parsed.data;

  // Validate templateVersion exists and is ACTIVE
  const tStore = readTemplates();
  const tvIdx = tStore.versions.findIndex((v) => v.id === templateVersionId);
  if (tvIdx === -1) {
    return NextResponse.json({ error: "Template version not found" }, { status: 404 });
  }
  const tv = tStore.versions[tvIdx];
  if (tv.status !== "ACTIVE") {
    return NextResponse.json({ error: "Template version must be ACTIVE" }, { status: 400 });
  }

  const now = nowStamp();
  const guidelineId = uuid();
  const versionId = uuid();

  const contentJson = emptyContent(tv.schemaJson);

  const guideline = {
    id: guidelineId,
    name,
    type,
    siteId,
    parentGuidelineId,
    templateVersionId,
    createdAt: now,
    updatedAt: now,
  };

  const version = {
    id: versionId,
    guidelineId,
    versionNumber: 1,
    status: "DRAFT" as const,
    contentJson,
    normalizedPayload: { parameters: [] },
    authorId: user.id,
    createdAt: now,
    updatedAt: now,
    versionStamp: versionStamp(),
  };

  const gStore = readGuidelines();
  gStore.guidelines.push(guideline);
  gStore.versions.push(version);
  writeGuidelines(gStore);

  appendAudit({
    id: uuid(),
    entityType: "Guideline",
    entityId: guidelineId,
    action: "CREATED",
    userId: user.id,
    userName: user.name,
    data: { name, type, siteId },
    createdAt: now,
  });

  return NextResponse.json({ guideline, version }, { status: 201 });
}
