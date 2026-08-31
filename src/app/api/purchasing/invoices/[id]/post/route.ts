import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { postSupplierInvoice } from "@/services/supplier-invoice-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const result = await postSupplierInvoice(session, Number(id));
    return NextResponse.json({
      success: true,
      message: "Faktur pembelian berhasil diposting dan AP terbentuk.",
      data: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
