import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readGuidelines, writeGuidelines, appendAudit, nowStamp, versionStamp } from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { validateLockConstraints } from "@/lib/locks";
import { v4 as uuid } from "uuid";

const SubmitSchema = z.object({
  reasonForChange: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, versionId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const store = readGuidelines();
  const guideline = store.guidelines.find((g) => g.id === id);
  if (!guideline) return NextResponse.json({ error: "Guideline not found" }, { status: 404 });

  const idx = store.versions.findIndex((v) => v.id === versionId && v.guidelineId === id);
  if (idx === -1) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const version = store.versions[idx];
  if (version.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT versions can be submitted" }, { status: 400 });
  }

  // Enforce: if versionNumber > 1, reasonForChange is required
  if (version.versionNumber > 1 && !parsed.data.reasonForChange?.trim()) {
    return NextResponse.json({ error: "Reason for change is required for new versions" }, { status: 400 });
  }

  // PASS 2 A: Lock constraint check on submit for CHILD guidelines
  if (guideline.type === "CHILD" && guideline.parentActiveVersionId) {
    const parentVersion = store.versions.find((v) => v.id === guideline.parentActiveVersionId);
    if (parentVersion) {
      const violations = validateLockConstraints(
        version.normalizedPayload.parameters,
        parentVersion.normalizedPayload.parameters
      );
      if (violations.length > 0) {
        return NextResponse.json(
          { error: "Cannot submit: lock constraint violations", violations },
          { status: 422 }
        );
      }
    }
  }

  const now = nowStamp();
  store.versions[idx] = {
    ...version,
    status: "REVIEW",
    reasonForChange: parsed.data.reasonForChange,
    updatedAt: now,
    versionStamp: versionStamp(),
  };
  writeGuidelines(store);

  appendAudit({
    id: uuid(),
    entityType: "GuidelineVersion",
    entityId: versionId,
    action: "SUBMITTED_FOR_REVIEW",
    userId: user.id,
    userName: user.name,
    data: { reasonForChange: parsed.data.reasonForChange },
    createdAt: now,
  });

  return NextResponse.json({ version: store.versions[idx] });
}
