import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getGeneralLedgerReport } from "@/services/accounting-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const sp = req.nextUrl.searchParams;
    const report = await getGeneralLedgerReport(
      session,
      {
        account_id: sp.get("accountId") ? parseInt(sp.get("accountId")!) : undefined,
        startDate: sp.get("startDate") || undefined,
        endDate: sp.get("endDate") || undefined,
      },
      sp.get("companyId")
    );
    return NextResponse.json({ data: report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
