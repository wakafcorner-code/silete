import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listAccounts, createAccount } from "@/services/accounting-service";
import { AccountType } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const sp = req.nextUrl.searchParams;
    const accounts = await listAccounts(
      session,
      {
        account_type: (sp.get("type") as AccountType) || undefined,
        status: sp.get("status") || "all",
        search: sp.get("search") || undefined,
      },
      sp.get("companyId")
    );
    return NextResponse.json({ data: accounts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const result = await createAccount(session, body, body.company_id);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
