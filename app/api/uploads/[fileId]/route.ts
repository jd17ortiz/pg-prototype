import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileId } = await params;
  // Sanitize: only allow uuid-like names
  if (!/^[\w-]{1,64}$/.test(fileId)) {
    return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });
  }

  // Find the file (may have any extension)
  if (!fs.existsSync(UPLOADS_DIR)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => f.startsWith(fileId));
  if (files.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(UPLOADS_DIR, files[0]);
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(files[0]).toLowerCase();

  const MIME: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".csv": "text/csv",
  };

  const contentType = MIME[ext] ?? "application/octet-stream";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${files[0]}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileId } = await params;
  if (!/^[\w-]{1,64}$/.test(fileId)) {
    return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });
  }

  if (!fs.existsSync(UPLOADS_DIR)) return NextResponse.json({ ok: true });

  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => f.startsWith(fileId));
  for (const f of files) {
    fs.unlinkSync(path.join(UPLOADS_DIR, f));
  }

  return NextResponse.json({ ok: true });
}
