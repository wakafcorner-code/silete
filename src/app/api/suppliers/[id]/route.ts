import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getSupplierById, updateSupplier } from "@/services/supplier-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });

    const { id } = await params;
    const supplier = await getSupplierById(session, Number(id));
    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error fetching supplier" },
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
    await updateSupplier(session, Number(id), body);

    return NextResponse.json({ success: true, message: "Supplier updated successfully" });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error updating supplier" },
      { status }
    );
  }
}
