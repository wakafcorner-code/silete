import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { postPaymentWithAllocations, getPaymentAllocations } from "@/services/payment-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const body = await req.json();
    // body.allocations: Array<{ receivable_id?, payable_id?, allocated_amount }>
    await postPaymentWithAllocations(session, parseInt(id), body.allocations ?? []);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const allocations = await getPaymentAllocations(session, parseInt(id));
    return NextResponse.json({ data: allocations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
