import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { UPLOADS_DIR, ensureUploadsDir } from "@/lib/db";
import { v4 as uuid } from "uuid";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canEdit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Size limit: 10 MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }

  ensureUploadsDir();

  const ext = path.extname(file.name).toLowerCase() || "";
  const fileId = uuid();
  const storedName = `${fileId}${ext}`;
  const filePath = path.join(UPLOADS_DIR, storedName);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return NextResponse.json({
    fileId,
    fileName: file.name,
    fileType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    url: `/api/uploads/${fileId}`,
  });
}
