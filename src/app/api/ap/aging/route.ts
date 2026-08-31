import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getAPAgingReport } from "@/services/payment-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const companyId = req.nextUrl.searchParams.get("companyId");
    const aging = await getAPAgingReport(session, companyId);
    return NextResponse.json({ data: aging });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
