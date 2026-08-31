import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { approvePurchaseRequest } from "@/services/purchase-request-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    await approvePurchaseRequest(session, Number(id));
    return NextResponse.json({ success: true, message: "Purchase request disetujui." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
