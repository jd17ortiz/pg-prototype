import { NextRequest, NextResponse } from "next/server";
import { readGuidelines } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const store = readGuidelines();
  const guideline = store.guidelines.find((g) => g.id === id);
  if (!guideline) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = store.versions.filter((v) => v.guidelineId === id);
  const approvals = store.approvals.filter((a) =>
    versions.some((v) => v.id === a.guidelineVersionId)
  );

  return NextResponse.json({ guideline, versions, approvals });
}
