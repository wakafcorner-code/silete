import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { deleteCashTransaction } from "@/services/cash-service";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    await deleteCashTransaction(session, parseInt(id));
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
