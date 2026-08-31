import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/services/auth-service";
import { SESSION_COOKIE_NAME, SESSION_DURATION_HOURS } from "@/services/session-service";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await authenticateUser(body);

    const isProduction = process.env.NODE_ENV === "production";
    const maxAge = SESSION_DURATION_HOURS * 60 * 60; // in seconds

    const response = NextResponse.json({
      success: true,
      message: "Login berhasil.",
      user: result.session,
    });

    // Set secure HttpOnly cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: result.token,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge,
    });

    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: error.issues[0]?.message || "Validasi input gagal.",
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Terjadi kesalahan saat autentikasi.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 401 }
    );
  }
}
