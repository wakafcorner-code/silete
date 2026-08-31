import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getJournalEntryById } from "@/services/accounting-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const journal = await getJournalEntryById(session, parseInt(id));
    if (!journal) {
      return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ data: journal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
