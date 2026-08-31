import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { resolveCompanyScope, ACTIVE_COMPANY_COOKIE } from "@/services/company-context-service";
import { getCompanyById } from "@/services/company-service";
import { hasCompanyAccess } from "@/services/rbac-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const activeCompanyId = await resolveCompanyScope(session);
    const company = await getCompanyById(session, activeCompanyId);

    return NextResponse.json({
      success: true,
      activeCompanyId,
      company,
    });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error getting active company" },
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
    const targetCompanyId = Number(body.companyId);

    if (!targetCompanyId || isNaN(targetCompanyId)) {
      return NextResponse.json({ success: false, error: "Valid companyId is required." }, { status: 400 });
    }

    // Verify user has access to this company
    if (!hasCompanyAccess(session, targetCompanyId)) {
      return NextResponse.json(
        { success: false, error: `Forbidden: Tidak memiliki akses ke Company ID ${targetCompanyId}.` },
        { status: 403 }
      );
    }

    const company = await getCompanyById(session, targetCompanyId);

    const response = NextResponse.json({
      success: true,
      message: `Berhasil berganti ke perusahaan ${company?.name || targetCompanyId}`,
      activeCompanyId: targetCompanyId,
      company,
    });

    // Set active company cookie
    response.cookies.set({
      name: ACTIVE_COMPANY_COOKIE,
      value: String(targetCompanyId),
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error switching company" },
      { status }
    );
  }
}
