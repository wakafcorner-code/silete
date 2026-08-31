import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getApprovalThresholds, setSystemSetting } from "@/services/setting-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
    const thresholds = await getApprovalThresholds(session, companyId);
    return NextResponse.json({ data: thresholds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    await setSystemSetting(
      session,
      body.company_id || null,
      body.setting_key,
      body.setting_value,
      body.setting_group || "general",
      body.description
    );
    return NextResponse.json({ success: true, message: "Setting saved successfully" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
