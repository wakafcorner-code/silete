import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listTransfers, createWarehouseTransfer, TransferSchema } from "@/services/transfer-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const { searchParams } = req.nextUrl;
    const result = await listTransfers(
      session,
      {
        page: Number(searchParams.get("page") ?? 1),
        limit: Number(searchParams.get("limit") ?? 20),
        warehouseId: searchParams.get("warehouse_id") ? Number(searchParams.get("warehouse_id")) : undefined,
        productId: searchParams.get("product_id") ? Number(searchParams.get("product_id")) : undefined,
        dateFrom: searchParams.get("date_from") ?? undefined,
        dateTo: searchParams.get("date_to") ?? undefined,
      },
      searchParams.get("company_id")
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const parsed = TransferSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", errors: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const result = await createWarehouseTransfer(session, parsed.data, body.company_id);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : msg.includes("Insufficient") ? 422 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
