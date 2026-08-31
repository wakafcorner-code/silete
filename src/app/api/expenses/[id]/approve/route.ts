import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { approveExpense } from "@/services/expense-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    await approveExpense(session, parseInt(id), body?.notes);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
