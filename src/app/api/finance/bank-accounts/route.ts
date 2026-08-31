import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listBankAccounts, createBankAccount } from "@/services/bank-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const companyId = req.nextUrl.searchParams.get("companyId");
    const accounts = await listBankAccounts(session, companyId);
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
    const result = await createBankAccount(session, body, body.company_id);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
