import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getExpenseById, deleteExpense } from "@/services/expense-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const expense = await getExpenseById(session, parseInt(id));
    if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: expense });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    await deleteExpense(session, parseInt(id));
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
