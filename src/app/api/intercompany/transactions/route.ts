import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import {
  listIntercompanyTransactions,
  createAndPostIntercompanyTransaction,
} from "@/services/intercompany-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const sp = req.nextUrl.searchParams;
    const result = await listIntercompanyTransactions(
      session,
      {
        page: sp.get("page") ? parseInt(sp.get("page")!) : 1,
        limit: sp.get("limit") ? parseInt(sp.get("limit")!) : 20,
        status: sp.get("status") || "all",
        transactionType: sp.get("type") || undefined,
      },
      sp.get("companyId")
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const result = await createAndPostIntercompanyTransaction(session, body);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
