import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { cookies } from "next/headers";
import { PermissionKey } from "@/config/permissions";

export const SESSION_COOKIE_NAME = "erp_session";
export const SESSION_DURATION_HOURS = 8;

export interface UserSessionPayload extends JWTPayload {
  userId: number;
  username: string;
  email: string;
  name: string;
  roles: string[];
  permissions: PermissionKey[];
  companyIds: number[];
  defaultCompanyId?: number | null;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET environment variable is missing or too short.");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign and generate a secure JWT session token
 */
export async function createSessionToken(payload: Omit<UserSessionPayload, "iat" | "exp">): Promise<string> {
  const secret = getJwtSecret();
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_HOURS}h`)
    .sign(secret);

  return token;
}

/**
 * Verify and decode a JWT session token
 */
export async function verifySessionToken(token: string): Promise<UserSessionPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as UserSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Helper to retrieve the current session in Server Components, Server Actions, or Route Handlers
 */
export async function getServerSession(): Promise<UserSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie?.value) {
      return null;
    }
    return await verifySessionToken(sessionCookie.value);
  } catch {
    return null;
  }
}
