import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  readGuidelines,
  writeGuidelines,
  readTemplates,
  readCompliance,
  appendAudit,
  nowStamp,
  versionStamp,
} from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { emptyContent } from "@/lib/normalize";
import { v4 as uuid } from "uuid";
import type { GuidelineVersion } from "@/lib/types";

function latestVersion(gid: string, versions: GuidelineVersion[]) {
  return versions
    .filter(v => v.guidelineId === gid)
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

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

  const sp = new URL(req.url).searchParams;
  const q                = sp.get("q")?.trim().toLowerCase() ?? "";
  const siteId           = sp.get("siteId") ?? "";
  const statusFilter     = sp.get("status")?.split(",").filter(Boolean) ?? [];
  const typeFilter       = sp.get("type")?.split(",").filter(Boolean) ?? [];
  const hasDraft         = sp.get("hasDraft") === "1";
  const hasOpenCompliance = sp.get("hasOpenCompliance") === "1";
  const sort             = sp.get("sort") ?? "updatedDesc";

  const store      = readGuidelines();
  const compliance = readCompliance();
  const allVersions = store.versions;

  // 1. Site scope
  let scoped = siteId ? store.guidelines.filter(g => g.siteId === siteId) : store.guidelines;

  // 2. Facets (computed before q/status/type/toggle filters)
  const facetStatus: Record<string, number> = {};
  const facetType:   Record<string, number> = {};
  for (const g of scoped) {
    const lv = latestVersion(g.id, allVersions);
    if (lv) facetStatus[lv.status] = (facetStatus[lv.status] ?? 0) + 1;
    facetType[g.type] = (facetType[g.type] ?? 0) + 1;
  }

  // 3. Remaining filters
  if (q) scoped = scoped.filter(g => g.name.toLowerCase().includes(q));

  if (statusFilter.length > 0) {
    scoped = scoped.filter(g => {
      const lv = latestVersion(g.id, allVersions);
      return lv && statusFilter.includes(lv.status);
    });
  }

  if (typeFilter.length > 0) {
    scoped = scoped.filter(g => typeFilter.includes(g.type));
  }

  if (hasDraft) {
    scoped = scoped.filter(g => allVersions.some(v => v.guidelineId === g.id && v.status === "DRAFT"));
  }

  if (hasOpenCompliance) {
    const openChildIds = new Set(
      compliance.tasks.filter(t => t.status === "OPEN").map(t => t.childGuidelineId)
    );
    scoped = scoped.filter(g => openChildIds.has(g.id));
  }

  // 4. Sort
  scoped = [...scoped].sort((a, b) => {
    if (sort === "nameAsc")    return a.name.localeCompare(b.name);
    if (sort === "nameDesc")   return b.name.localeCompare(a.name);
    if (sort === "updatedAsc") return a.updatedAt.localeCompare(b.updatedAt);
    return b.updatedAt.localeCompare(a.updatedAt); // updatedDesc (default)
  });

  // 5. Only return versions for matched guidelines
  const scopedIds = new Set(scoped.map(g => g.id));
  const versions  = allVersions.filter(v => scopedIds.has(v.guidelineId));

  return NextResponse.json({
    guidelines: scoped,
    versions,
    approvals: store.approvals,
    facets: { status: facetStatus, type: facetType },
  });
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
