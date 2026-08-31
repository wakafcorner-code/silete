import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getIntercompanyTransactionById } from "@/services/intercompany-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const details = await getIntercompanyTransactionById(session, parseInt(id));
    if (!details) {
      return NextResponse.json({ error: "Transaksi intercompany tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ data: details });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
