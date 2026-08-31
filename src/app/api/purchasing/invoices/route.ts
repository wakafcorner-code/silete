import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listSupplierInvoices, createSupplierInvoice, SupplierInvoiceSchema } from "@/services/supplier-invoice-service";
import { InvoiceStatus } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const { searchParams } = req.nextUrl;
    const result = await listSupplierInvoices(
      session,
      {
        page: Number(searchParams.get("page") ?? 1),
        limit: Number(searchParams.get("limit") ?? 20),
        status: (searchParams.get("status") ?? undefined) as InvoiceStatus | "all" | undefined,
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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const parsed = SupplierInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", errors: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const result = await createSupplierInvoice(session, parsed.data, body.company_id);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : msg.includes("sudah digunakan") ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
