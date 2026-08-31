import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getIntercompanyReconciliation } from "@/services/intercompany-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const sp = req.nextUrl.searchParams;
    const sourceCompanyId = parseInt(sp.get("sourceCompanyId") || "1");
    const destinationCompanyId = parseInt(sp.get("destinationCompanyId") || "2");
    const asOfDate = sp.get("asOfDate") || undefined;

    const report = await getIntercompanyReconciliation(
      session,
      sourceCompanyId,
      destinationCompanyId,
      asOfDate
    );
    return NextResponse.json({ data: report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
