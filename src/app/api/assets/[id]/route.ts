import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { getAssetById } from "@/services/asset-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    const asset = await getAssetById(session, parseInt(id));
    if (!asset) {
      return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ data: asset });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Unauthorized") ? 403 : 400 });
  }
}
