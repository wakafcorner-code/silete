import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getDeliveryById, cancelDelivery } from "@/services/delivery-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const result = await getDeliveryById(session, Number(id));
    if (!result) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    await cancelDelivery(session, Number(id));
    return NextResponse.json({ success: true, message: "Surat jalan dibatalkan." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
