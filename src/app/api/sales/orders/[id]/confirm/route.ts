import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { confirmSalesOrder } from "@/services/sales-order-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    await confirmSalesOrder(session, Number(id));
    return NextResponse.json({ success: true, message: "Sales order berhasil dikonfirmasi." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
