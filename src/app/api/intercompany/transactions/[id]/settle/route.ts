import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { settleIntercompanyTransaction } from "@/services/intercompany-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const body = await req.json();
    const result = await settleIntercompanyTransaction(session, parseInt(id), body);
    return NextResponse.json({ data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
