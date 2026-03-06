import { NextRequest, NextResponse } from "next/server";
import { readCompliance, readGuidelines } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  const status = searchParams.get("status");

  const compStore = readCompliance();
  const glStore = readGuidelines();

  let tasks = compStore.tasks;
  if (siteId) tasks = tasks.filter((t) => t.siteId === siteId);
  if (status) tasks = tasks.filter((t) => t.status === status);

  // Enrich with guideline names
  const enriched = tasks.map((t) => {
    const child = glStore.guidelines.find((g) => g.id === t.childGuidelineId);
    const parent = glStore.guidelines.find((g) => g.id === t.parentGuidelineId);
    const parentVersion = glStore.versions.find((v) => v.id === t.parentVersionId);
    return {
      ...t,
      childGuidelineName: child?.name ?? t.childGuidelineId,
      parentGuidelineName: parent?.name ?? t.parentGuidelineId,
      parentVersionNumber: parentVersion?.versionNumber ?? "?",
    };
  });

  return NextResponse.json({ tasks: enriched });
}
