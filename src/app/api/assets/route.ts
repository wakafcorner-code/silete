import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { listAssets, createAsset } from "@/services/asset-service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const sp = req.nextUrl.searchParams;
    const result = await listAssets(
      session,
      {
        page: sp.get("page") ? parseInt(sp.get("page")!) : 1,
        limit: sp.get("limit") ? parseInt(sp.get("limit")!) : 20,
        status: sp.get("status") || "all",
        categoryId: sp.get("categoryId") ? parseInt(sp.get("categoryId")!) : undefined,
        search: sp.get("search") || undefined,
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
    const result = await createAsset(session, body, body.company_id);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
