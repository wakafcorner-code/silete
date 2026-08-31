import { z } from "zod";
import { findUserByCredentials, verifyPassword, updateLastLogin, getUserRoles } from "@/services/user-service";
import { createSessionToken, UserSessionPayload } from "@/services/session-service";
import { getEffectivePermissions } from "@/services/rbac-service";

export const LoginInputSchema = z.object({
  identifier: z
    .string()
    .min(1, "Email atau username harus diisi.")
    .max(150, "Maksimal 150 karakter."),
  password: z
    .string()
    .min(1, "Kata sandi harus diisi.")
    .max(100, "Maksimal 100 karakter."),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export interface LoginResult {
  token: string;
  session: UserSessionPayload;
}

/**
 * Authenticate user with credentials and issue a session token
 */
export async function authenticateUser(input: LoginInput): Promise<LoginResult> {
  // 1. Zod input validation
  const validated = LoginInputSchema.parse(input);

  // 2. Lookup user by username or email
  const user = await findUserByCredentials(validated.identifier);
  if (!user) {
    throw new Error("Kredensial tidak valid: Pengguna tidak ditemukan.");
  }

  // 3. Verify account status
  if (user.status === "inactive") {
    throw new Error("Akun Anda sedang dinonaktifkan. Silakan hubungi administrator.");
  }

  if (user.status === "locked") {
    throw new Error("Akun Anda terkunci karena alasan keamanan. Hubungi administrator.");
  }

  // 4. Verify password with bcrypt
  const isMatch = await verifyPassword(validated.password, user.password_hash);
  if (!isMatch) {
    throw new Error("Kredensial tidak valid: Kata sandi salah.");
  }

  // 5. Update last login timestamp
  await updateLastLogin(user.id);

  // 6. Fetch user roles & company associations
  const { roles, companyIds } = await getUserRoles(user.id);
  const permissions = getEffectivePermissions(roles);

  // 7. Generate JWT Session Payload
  const payload: Omit<UserSessionPayload, "iat" | "exp"> = {
    userId: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    roles,
    permissions,
    companyIds,
    defaultCompanyId: companyIds.length > 0 ? companyIds[0] : null,
  };

  const token = await createSessionToken(payload);

  return {
    token,
    session: payload as UserSessionPayload,
  };
}
