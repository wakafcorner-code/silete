import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listAdminUsers, createAdminUser } from "@/services/user-admin-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
    const search = req.nextUrl.searchParams.get("search") || undefined;

    const data = await listAdminUsers(session, { page, limit, search });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const newId = await createAdminUser(session, body);
    return NextResponse.json({ success: true, user_id: newId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
