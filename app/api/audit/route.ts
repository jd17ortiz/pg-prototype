import { NextRequest, NextResponse } from "next/server";
import { readAudit } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get("entityId");

  const { events } = readAudit();
  const filtered = entityId ? events.filter((e) => e.entityId === entityId) : events;
  return NextResponse.json({ events: filtered.slice(-200).reverse() });
}
