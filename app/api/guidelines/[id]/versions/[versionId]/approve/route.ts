import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  readGuidelines,
  writeGuidelines,
  readCompliance,
  writeCompliance,
  appendAudit,
  nowStamp,
  versionStamp,
} from "@/lib/db";
import { getCurrentUser, canApprove } from "@/lib/auth";
import { validateLockConstraints } from "@/lib/locks";
import { v4 as uuid } from "uuid";
import type { ComplianceTask } from "@/lib/types";

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

  // PASS 2 A: Final lock check on approve for CHILD guidelines
  if (guideline.type === "CHILD" && guideline.parentActiveVersionId && parsed.data.decision === "APPROVE") {
    const parentVersion = store.versions.find((v) => v.id === guideline.parentActiveVersionId);
    if (parentVersion) {
      const violations = validateLockConstraints(
        version.normalizedPayload.parameters,
        parentVersion.normalizedPayload.parameters
      );
      if (violations.length > 0) {
        return NextResponse.json(
          { error: "Cannot approve: lock constraint violations", violations },
          { status: 422 }
        );
      }
    }
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

    // PASS 2 C: If PARENT just went ACTIVE, create compliance tasks for all linked children
    if (guideline.type === "PARENT") {
      const childGuidelines = store.guidelines.filter(
        (g) => g.type === "CHILD" && g.parentGuidelineId === id
      );
      if (childGuidelines.length > 0) {
        const compStore = readCompliance();
        for (const child of childGuidelines) {
          // Only create if no OPEN task already exists for this parent version + child
          const existingOpen = compStore.tasks.find(
            (t) =>
              t.childGuidelineId === child.id &&
              t.parentVersionId === versionId &&
              t.status === "OPEN"
          );
          if (!existingOpen) {
            const task: ComplianceTask = {
              id: uuid(),
              parentGuidelineId: id,
              parentVersionId: versionId,
              childGuidelineId: child.id,
              siteId: child.siteId,
              status: "OPEN",
              createdAt: now,
            };
            compStore.tasks.push(task);
            appendAudit({
              id: uuid(),
              entityType: "ComplianceTask",
              entityId: task.id,
              action: "CREATED",
              userId: user.id,
              userName: user.name,
              data: { childGuidelineId: child.id, parentVersionId: versionId },
              createdAt: now,
            });
          }
        }
        writeCompliance(compStore);
      }
    }

    // PASS 2 C: If CHILD just went ACTIVE, auto-close open compliance tasks for it
    if (guideline.type === "CHILD") {
      const compStore = readCompliance();
      let changed = false;
      for (let i = 0; i < compStore.tasks.length; i++) {
        if (
          compStore.tasks[i].childGuidelineId === id &&
          compStore.tasks[i].status === "OPEN"
        ) {
          compStore.tasks[i] = {
            ...compStore.tasks[i],
            status: "DONE",
            completedAt: now,
          };
          changed = true;
        }
      }
      if (changed) writeCompliance(compStore);
    }
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
