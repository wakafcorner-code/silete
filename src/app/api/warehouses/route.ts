import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listWarehouses, createWarehouse } from "@/services/warehouse-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedCompanyId = searchParams.get("companyId");

    const warehouses = await listWarehouses(session, requestedCompanyId);
    return NextResponse.json({ success: true, warehouses });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error listing warehouses" },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const body = await req.json();
    const warehouse = await createWarehouse(session, body, body.company_id);
    return NextResponse.json({ success: true, warehouse }, { status: 201 });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error creating warehouse" },
      { status }
    );
  }
}
