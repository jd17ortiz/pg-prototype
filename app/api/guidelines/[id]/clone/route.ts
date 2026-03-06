import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  readGuidelines,
  writeGuidelines,
  appendAudit,
  nowStamp,
  versionStamp,
} from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { v4 as uuid } from "uuid";

const CloneSchema = z.object({
  name: z.string().min(1),
  siteId: z.string().min(1),
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
  const parsed = CloneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const store = readGuidelines();
  const parentGuideline = store.guidelines.find((g) => g.id === id);
  if (!parentGuideline) return NextResponse.json({ error: "Parent guideline not found" }, { status: 404 });

  if (parentGuideline.type !== "PARENT") {
    return NextResponse.json({ error: "Only PARENT guidelines can be cloned" }, { status: 400 });
  }

  // Get ACTIVE version of parent
  const activeVersion = store.versions.find((v) => v.guidelineId === id && v.status === "ACTIVE");
  if (!activeVersion) {
    return NextResponse.json({ error: "Parent guideline has no ACTIVE version" }, { status: 400 });
  }

  const now = nowStamp();
  const childId = uuid();

  const childGuideline = {
    id: childId,
    name: parsed.data.name,
    type: "CHILD" as const,
    siteId: parsed.data.siteId,
    parentGuidelineId: id,
    // PASS 2: record which parent active version was used
    parentActiveVersionId: activeVersion.id,
    templateVersionId: parentGuideline.templateVersionId,
    createdAt: now,
    updatedAt: now,
  };

  const childVersion = {
    id: uuid(),
    guidelineId: childId,
    versionNumber: 1,
    status: "DRAFT" as const,
    contentJson: structuredClone(activeVersion.contentJson),
    normalizedPayload: structuredClone(activeVersion.normalizedPayload),
    authorId: user.id,
    createdAt: now,
    updatedAt: now,
    versionStamp: versionStamp(),
  };

  store.guidelines.push(childGuideline);
  store.versions.push(childVersion);
  writeGuidelines(store);

  appendAudit({
    id: uuid(),
    entityType: "Guideline",
    entityId: childId,
    action: "CLONED_FROM_PARENT",
    userId: user.id,
    userName: user.name,
    data: { parentGuidelineId: id, parentActiveVersionId: activeVersion.id, siteId: parsed.data.siteId },
    createdAt: now,
  });

  return NextResponse.json({ guideline: childGuideline, version: childVersion }, { status: 201 });
}
