import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listAdjustments, createAdjustment, StockAdjustmentSchema } from "@/services/adjustment-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const { searchParams } = req.nextUrl;
    const result = await listAdjustments(
      session,
      {
        page: Number(searchParams.get("page") ?? 1),
        limit: Number(searchParams.get("limit") ?? 20),
        status: searchParams.get("status") ?? undefined,
        warehouseId: searchParams.get("warehouse_id") ? Number(searchParams.get("warehouse_id")) : undefined,
        productId: searchParams.get("product_id") ? Number(searchParams.get("product_id")) : undefined,
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
    const parsed = StockAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", errors: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const result = await createAdjustment(session, parsed.data, body.company_id);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
