import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { parseExcel } from "@/lib/migration/parser";
import { PROFILES } from "@/lib/migration/profiles";
import {
  readImports, writeImports, readSites, writeSites,
  UPLOADS_DIR, nowStamp,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const NIEBULL_SITE = { id: "site-niebull", name: "Niebull", code: "NIE-DE" };

export async function GET() {
  // Return available profiles (for the UI to populate the selector)
  return NextResponse.json({
    profiles: PROFILES.map(p => ({ id: p.id, name: p.name, description: p.description })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure Niebull site exists
  const sitesStore = readSites();
  if (!sitesStore.sites.find(s => s.id === NIEBULL_SITE.id)) {
    sitesStore.sites.push(NIEBULL_SITE);
    writeSites(sitesStore);
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const profileId = formData.get("profileId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const filename = file.name;
  const ext = path.extname(filename).toLowerCase();
  if (![".xlsx", ".xlsm"].includes(ext)) {
    return NextResponse.json(
      { error: "Only .xlsx and .xlsm files are supported" },
      { status: 400 }
    );
  }

  // Save file to /data/uploads/
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const fileId = randomUUID();
  const savedName = `${fileId}${ext}`;
  const destPath = path.join(UPLOADS_DIR, savedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  // Parse Excel
  let preview;
  try {
    preview = parseExcel(buffer, profileId ?? undefined);
  } catch (err) {
    // Remove saved file on parse failure
    fs.unlinkSync(destPath);
    const msg = err instanceof Error ? err.message : "Unknown parse error";
    return NextResponse.json({ error: `Failed to parse Excel: ${msg}` }, { status: 422 });
  }

  // Store import run (no guidelineId yet — created later on "Create Draft")
  const runId = randomUUID();
  const importsStore = readImports();
  importsStore.runs.push({
    id: runId,
    fileId: savedName,
    filename,
    siteId: "site-niebull",
    profileId: preview.profileId,
    templateVersionId: "",      // filled in on create-draft
    createdBy: user.id,
    createdAt: nowStamp(),
    warnings: preview.warnings,
    preview,
  });
  writeImports(importsStore);

  return NextResponse.json({
    runId,
    fileId: savedName,
    filename,
    preview,
  });
}
