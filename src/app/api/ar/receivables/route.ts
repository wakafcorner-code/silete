import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listReceivables } from "@/services/payment-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const sp = req.nextUrl.searchParams;
    const result = await listReceivables(
      session,
      {
        page: sp.get("page") ? parseInt(sp.get("page")!) : 1,
        limit: sp.get("limit") ? parseInt(sp.get("limit")!) : 20,
        status: sp.get("status") ?? "all",
        customerId: sp.get("customerId") ? parseInt(sp.get("customerId")!) : undefined,
      },
      sp.get("companyId")
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
