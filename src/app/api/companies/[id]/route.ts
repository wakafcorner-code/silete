import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getCompanyById, updateCompany } from "@/services/company-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const { id } = await params;
    const companyId = parseInt(id, 10);
    if (isNaN(companyId) || companyId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid company ID" }, { status: 400 });
    }

    const company = await getCompanyById(session, companyId);
    if (!company) {
      return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, company });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error fetching company" },
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
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const { id } = await params;
    const companyId = parseInt(id, 10);
    if (isNaN(companyId) || companyId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid company ID" }, { status: 400 });
    }

    const body = await req.json();
    await updateCompany(session, companyId, body);

    return NextResponse.json({ success: true, message: "Company updated successfully" });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error updating company" },
      { status }
    );
  }
}
