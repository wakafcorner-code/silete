import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { rejectPurchaseRequest } from "@/services/purchase-request-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    await rejectPurchaseRequest(session, Number(id), body.reason);
    return NextResponse.json({ success: true, message: "Purchase request ditolak." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
