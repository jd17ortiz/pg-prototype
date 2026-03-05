import { NextResponse } from "next/server";
import { readUsers } from "@/lib/db";

// Public endpoint for login picker - returns user list without sensitive info
export async function GET() {
  const { users } = readUsers();
  return NextResponse.json({ users });
}
