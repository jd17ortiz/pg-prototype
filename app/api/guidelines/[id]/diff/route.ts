import { NextRequest, NextResponse } from "next/server";
import { readGuidelines, readTemplates } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computeDiff } from "@/lib/diff";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const vA = searchParams.get("vA");
  const vB = searchParams.get("vB");

  const store = readGuidelines();
  const guideline = store.guidelines.find((g) => g.id === id);
  if (!guideline) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = store.versions.filter((v) => v.guidelineId === id);

  // Default: compare ARCHIVED (or oldest) vs DRAFT/ACTIVE (latest)
  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const verA = vA ? versions.find((v) => v.id === vA) : sorted[sorted.length - 2] ?? sorted[0];
  const verB = vB ? versions.find((v) => v.id === vB) : sorted[sorted.length - 1];

  if (!verA || !verB) {
    return NextResponse.json({ error: "Need at least two versions to diff" }, { status: 400 });
  }

  const tStore = readTemplates();
  const tv = tStore.versions.find((v) => v.id === guideline.templateVersionId);
  if (!tv) return NextResponse.json({ error: "Template version not found" }, { status: 404 });

  const diff = computeDiff(verA, verB, tv.schemaJson);
  return NextResponse.json({ diff, vA: verA, vB: verB });
}
