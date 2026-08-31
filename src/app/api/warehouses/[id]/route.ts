import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getWarehouseById, updateWarehouse } from "@/services/warehouse-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });

    const { id } = await params;
    const warehouse = await getWarehouseById(session, Number(id));
    if (!warehouse) {
      return NextResponse.json({ success: false, error: "Gudang tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ success: true, warehouse });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    await updateWarehouse(session, Number(id), body);

    return NextResponse.json({ success: true, message: "Gudang berhasil diperbarui" });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error updating warehouse" },
      { status }
    );
  }
}
