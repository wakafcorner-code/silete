import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getExecutiveDashboardSummary } from "@/services/report-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const asOfDate = req.nextUrl.searchParams.get("asOfDate") || undefined;
    const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
    const data = await getExecutiveDashboardSummary(session, companyId, asOfDate);
    return NextResponse.json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
