import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listCashTransactions, recordCashTransaction } from "@/services/cash-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const sp = req.nextUrl.searchParams;
    const result = await listCashTransactions(
      session,
      {
        page: sp.get("page") ? parseInt(sp.get("page")!) : 1,
        limit: sp.get("limit") ? parseInt(sp.get("limit")!) : 20,
        accountId: sp.get("accountId") ? parseInt(sp.get("accountId")!) : undefined,
        transactionType: (sp.get("type") as "in" | "out" | "transfer") ?? undefined,
        status: (sp.get("status") as "draft" | "posted" | "cancelled" | "all") ?? "all",
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
    const post = body.post_immediately !== false;
    const result = await recordCashTransaction(session, body, post, body.company_id);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
