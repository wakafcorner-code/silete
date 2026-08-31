import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getEmployeeById, updateEmployee } from "@/services/employee-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });

    const { id } = await params;
    const employee = await getEmployeeById(session, Number(id));
    if (!employee) {
      return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, employee });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error fetching employee" },
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
    if (!session) return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    await updateEmployee(session, Number(id), body);

    return NextResponse.json({ success: true, message: "Employee updated successfully" });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error updating employee" },
      { status }
    );
  }
}
