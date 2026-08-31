import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listMovements } from "@/services/inventory-service";
import { InventoryTransactionType } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const { searchParams } = req.nextUrl;

    const result = await listMovements(
      session,
      {
        page: Number(searchParams.get("page") ?? 1),
        limit: Number(searchParams.get("limit") ?? 30),
        warehouseId: searchParams.get("warehouse_id") ? Number(searchParams.get("warehouse_id")) : undefined,
        productId: searchParams.get("product_id") ? Number(searchParams.get("product_id")) : undefined,
        transactionType: (searchParams.get("transaction_type") ?? undefined) as InventoryTransactionType | undefined,
        dateFrom: searchParams.get("date_from") ?? undefined,
        dateTo: searchParams.get("date_to") ?? undefined,
        search: searchParams.get("search") ?? undefined,
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
