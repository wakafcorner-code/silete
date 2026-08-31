import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listPayables } from "@/services/supplier-invoice-service";
import { PayableStatus } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const { searchParams } = req.nextUrl;
    const result = await listPayables(
      session,
      {
        page: Number(searchParams.get("page") ?? 1),
        limit: Number(searchParams.get("limit") ?? 20),
        status: (searchParams.get("status") ?? undefined) as PayableStatus | "all" | undefined,
        supplierId: searchParams.get("supplier_id") ? Number(searchParams.get("supplier_id")) : undefined,
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
