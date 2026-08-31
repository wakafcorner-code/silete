import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listAuditLogs } from "@/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const companyId = req.nextUrl.searchParams.get("companyId") || undefined;

    const data = await listAuditLogs(session, { page, limit, search }, companyId);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 400 });
  }
}
