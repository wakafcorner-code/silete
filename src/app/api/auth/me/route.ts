import { NextResponse } from "next/server";
import { getServerSession } from "@/services/session-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthenticated: Tidak ada sesi aktif.",
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    user: session,
  });
}
