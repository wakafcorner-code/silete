import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getConsolidatedBalanceSheet } from "@/services/consolidation-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const asOfDate = req.nextUrl.searchParams.get("asOfDate") || undefined;
    const report = await getConsolidatedBalanceSheet(session, asOfDate);
    return NextResponse.json({ data: report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
