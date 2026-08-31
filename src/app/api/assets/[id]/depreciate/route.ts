import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { postAssetDepreciation, listAssetDepreciations } from "@/services/asset-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const body = await req.json();
    const result = await postAssetDepreciation(
      session,
      parseInt(id),
      body.depreciation_date || new Date().toISOString().split("T")[0],
      body.amount ? Number(body.amount) : undefined
    );
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const list = await listAssetDepreciations(session, parseInt(id));
    return NextResponse.json({ data: list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
