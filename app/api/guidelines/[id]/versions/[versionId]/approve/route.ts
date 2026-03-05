import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  readGuidelines,
  writeGuidelines,
  appendAudit,
  nowStamp,
  versionStamp,
} from "@/lib/db";
import { getCurrentUser, canApprove } from "@/lib/auth";
import { v4 as uuid } from "uuid";

const ApproveSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !canApprove(user)) {
    return NextResponse.json({ error: "Forbidden - APPROVER role required" }, { status: 403 });
  }

  const { id, versionId } = await params;
  const body = await req.json();
  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const store = readGuidelines();
  const guideline = store.guidelines.find((g) => g.id === id);
  if (!guideline) return NextResponse.json({ error: "Guideline not found" }, { status: 404 });

  const idx = store.versions.findIndex((v) => v.id === versionId && v.guidelineId === id);
  if (idx === -1) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const version = store.versions[idx];
  if (version.status !== "REVIEW") {
    return NextResponse.json({ error: "Version is not in REVIEW status" }, { status: 400 });
  }

  // Separation of duties: approver cannot be the author
  if (version.authorId === user.id) {
    return NextResponse.json({ error: "Author cannot approve their own submission" }, { status: 403 });
  }

  const now = nowStamp();
  const approval = {
    id: uuid(),
    guidelineVersionId: versionId,
    approverId: user.id,
    decision: parsed.data.decision,
    comment: parsed.data.comment,
    createdAt: now,
  };

  if (parsed.data.decision === "APPROVE") {
    // Archive any current ACTIVE version for this guideline
    for (let i = 0; i < store.versions.length; i++) {
      if (store.versions[i].guidelineId === id && store.versions[i].status === "ACTIVE") {
        store.versions[i] = {
          ...store.versions[i],
          status: "ARCHIVED",
          updatedAt: now,
          versionStamp: versionStamp(),
        };
      }
    }
    store.versions[idx] = {
      ...version,
      status: "ACTIVE",
      updatedAt: now,
      versionStamp: versionStamp(),
    };
  } else {
    // Reject → back to DRAFT
    store.versions[idx] = {
      ...version,
      status: "DRAFT",
      updatedAt: now,
      versionStamp: versionStamp(),
    };
  }

  store.approvals.push(approval);
  writeGuidelines(store);

  appendAudit({
    id: uuid(),
    entityType: "Approval",
    entityId: approval.id,
    action: parsed.data.decision === "APPROVE" ? "APPROVED" : "REJECTED",
    userId: user.id,
    userName: user.name,
    data: { comment: parsed.data.comment, guidelineVersionId: versionId },
    createdAt: now,
  });

  return NextResponse.json({ approval, version: store.versions[idx] });
}
