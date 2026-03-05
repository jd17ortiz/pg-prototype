import { NextRequest, NextResponse } from "next/server";
import {
  readGuidelines,
  writeGuidelines,
  appendAudit,
  nowStamp,
  versionStamp,
} from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { v4 as uuid } from "uuid";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, versionId } = await params;
  const store = readGuidelines();

  const guideline = store.guidelines.find((g) => g.id === id);
  if (!guideline) return NextResponse.json({ error: "Guideline not found" }, { status: 404 });

  const sourceVersion = store.versions.find((v) => v.id === versionId && v.guidelineId === id);
  if (!sourceVersion) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  if (sourceVersion.status !== "ACTIVE") {
    return NextResponse.json({ error: "Can only create new version from an ACTIVE version" }, { status: 400 });
  }

  // Check no existing draft
  const existingDraft = store.versions.find((v) => v.guidelineId === id && v.status === "DRAFT");
  if (existingDraft) {
    return NextResponse.json({ error: "A draft version already exists" }, { status: 400 });
  }

  const maxVersion = Math.max(...store.versions.filter((v) => v.guidelineId === id).map((v) => v.versionNumber));
  const now = nowStamp();

  const newVersion = {
    id: uuid(),
    guidelineId: id,
    versionNumber: maxVersion + 1,
    status: "DRAFT" as const,
    contentJson: structuredClone(sourceVersion.contentJson),
    normalizedPayload: structuredClone(sourceVersion.normalizedPayload),
    authorId: user.id,
    createdAt: now,
    updatedAt: now,
    versionStamp: versionStamp(),
  };

  store.versions.push(newVersion);
  writeGuidelines(store);

  appendAudit({
    id: uuid(),
    entityType: "GuidelineVersion",
    entityId: newVersion.id,
    action: "NEW_VERSION_CREATED",
    userId: user.id,
    userName: user.name,
    data: { sourceVersionId: versionId, versionNumber: newVersion.versionNumber },
    createdAt: now,
  });

  return NextResponse.json({ version: newVersion }, { status: 201 });
}
