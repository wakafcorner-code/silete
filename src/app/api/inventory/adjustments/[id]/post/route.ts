import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";
import { postAdjustment } from "@/services/adjustment-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    const { id } = await params;
    await postAdjustment(session, Number(id));
    return NextResponse.json({ success: true, message: "Adjustment berhasil diposting." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg.includes("Unauthorized") || msg.includes("Forbidden") ? 403 : msg.includes("Insufficient") ? 422 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
