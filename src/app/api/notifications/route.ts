import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listUserNotifications, markAllNotificationsAsRead } from "@/services/notification-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

    const data = await listUserNotifications(session, { page, limit });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST() {
  try {
    const session = await getServerSession();
    await markAllNotificationsAsRead(session);
    return NextResponse.json({ success: true, message: "All notifications marked as read" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
