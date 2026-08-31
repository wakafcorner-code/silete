import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listPermittedCompanies, createCompany } from "@/services/company-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const companies = await listPermittedCompanies(session);
    return NextResponse.json({ success: true, companies });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error listing companies" },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const body = await req.json();
    const created = await createCompany(session, body);
    return NextResponse.json({ success: true, company: created }, { status: 201 });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error creating company" },
      { status }
    );
  }
}
