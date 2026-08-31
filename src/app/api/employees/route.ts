import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listEmployees, createEmployee } from "@/services/employee-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 20;
    const search = searchParams.get("search") || undefined;
    const status = (searchParams.get("status") as "active" | "inactive" | "all") || undefined;
    const branchId = searchParams.get("branchId") ? Number(searchParams.get("branchId")) : undefined;
    const companyId = searchParams.get("companyId") || undefined;

    const result = await listEmployees(session, { page, limit, search, status, branchId }, companyId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error listing employees" },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });

    const body = await req.json();
    const employee = await createEmployee(session, body, body.company_id);
    return NextResponse.json({ success: true, employee }, { status: 201 });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error creating employee" },
      { status }
    );
  }
}
