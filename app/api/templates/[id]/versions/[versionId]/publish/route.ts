import { NextRequest, NextResponse } from "next/server";
import { readTemplates, writeTemplates, appendAudit, nowStamp, versionStamp } from "@/lib/db";
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
  const store = readTemplates();

  const idx = store.versions.findIndex((v) => v.id === versionId && v.templateId === id);
  if (idx === -1) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const version = store.versions[idx];
  if (version.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT versions can be published" }, { status: 400 });
  }

  const now = nowStamp();

  // Archive any currently ACTIVE version
  for (let i = 0; i < store.versions.length; i++) {
    if (store.versions[i].templateId === id && store.versions[i].status === "ACTIVE") {
      store.versions[i] = { ...store.versions[i], status: "ARCHIVED", updatedAt: now };
    }
  }

  store.versions[idx] = {
    ...version,
    status: "ACTIVE",
    updatedAt: now,
    versionStamp: versionStamp(),
    publishedBy: user.id,
  };

  writeTemplates(store);

  appendAudit({
    id: uuid(),
    entityType: "TemplateVersion",
    entityId: versionId,
    action: "PUBLISHED",
    userId: user.id,
    userName: user.name,
    data: { versionNumber: version.versionNumber },
    createdAt: now,
  });

  return NextResponse.json({ version: store.versions[idx] });
}
