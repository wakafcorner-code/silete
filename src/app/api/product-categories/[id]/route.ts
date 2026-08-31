import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getProductCategoryById, updateProductCategory } from "@/services/product-category-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });

    const { id } = await params;
    const category = await getProductCategoryById(session, Number(id));
    if (!category) {
      return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, category });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error fetching product category" },
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
    await updateProductCategory(session, Number(id), body);

    return NextResponse.json({ success: true, message: "Product category updated successfully" });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error updating product category" },
      { status }
    );
  }
}
