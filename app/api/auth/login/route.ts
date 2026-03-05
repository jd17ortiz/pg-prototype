import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readUsers } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

const LoginSchema = z.object({ userId: z.string() });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { users } = readUsers();
  const user = users.find((u) => u.id === parsed.data.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ user });
}
