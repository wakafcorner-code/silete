import fs from "fs";
import path from "path";

// Load environment variables
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const filePath = path.resolve(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [key, ...values] = trimmed.split("=");
          const value = values.join("=").replace(/^["'](.*)["']$/, "$1");
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = value;
          }
        }
      }
    }
  }
}

loadEnv();

import { authenticateUser } from "../src/services/auth-service";
import { createSessionToken, verifySessionToken, UserSessionPayload } from "../src/services/session-service";
import {
  hasCompanyAccess,
  requireAuth,
  requireRole,
  requirePermission,
} from "../src/services/rbac-service";
import { findUserById, hashPassword, verifyPassword } from "../src/services/user-service";
import { PERMISSIONS } from "../src/config/permissions";

async function runAuthRbacTests() {
  console.log("==================================================");
  console.log("PHASE 03: AUTHENTICATION & RBAC VERIFICATION SUITE");
  console.log("==================================================");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [TEST ${totalTests}] PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [TEST ${totalTests}] FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
    }
  }

  // 1. Password Hashing Test
  const testPlain = "SecretPassword@123";
  const hashed = await hashPassword(testPlain);
  const verifyMatch = await verifyPassword(testPlain, hashed);
  const verifyWrong = await verifyPassword("WrongPassword", hashed);
  assert(verifyMatch && !verifyWrong, "Bcrypt password hashing & verification works");

  // 2. Valid Login (SuperAdmin)
  let superAdminSession: UserSessionPayload | null = null;
  try {
    const res = await authenticateUser({
      identifier: "superadmin",
      password: "SuperAdmin@123456",
    });
    superAdminSession = res.session;
    assert(
      res.session.roles.includes("SUPER_ADMIN") && res.session.userId > 0 && !!res.token,
      "SuperAdmin valid login returns token and SUPER_ADMIN role"
    );
  } catch (err) {
    assert(false, "SuperAdmin valid login", String(err));
  }

  // 3. Valid Login (Finance)
  let financeSession: UserSessionPayload | null = null;
  try {
    const res = await authenticateUser({
      identifier: "finance",
      password: "Finance@123456",
    });
    financeSession = res.session;
    assert(
      res.session.roles.includes("FINANCE") &&
        res.session.permissions.includes(PERMISSIONS.FINANCE_MANAGE),
      "Finance valid login returns FINANCE role and finance.manage permission"
    );
  } catch (err) {
    assert(false, "Finance valid login", String(err));
  }

  // 4. Valid Login (Viewer)
  let viewerSession: UserSessionPayload | null = null;
  try {
    const res = await authenticateUser({
      identifier: "viewer",
      password: "Viewer@123456",
    });
    viewerSession = res.session;
    assert(
      res.session.roles.includes("VIEWER") &&
        !res.session.permissions.includes(PERMISSIONS.FINANCE_MANAGE) &&
        res.session.permissions.includes(PERMISSIONS.DASHBOARD_VIEW),
      "Viewer valid login returns VIEWER role with read-only permissions"
    );
  } catch (err) {
    assert(false, "Viewer valid login", String(err));
  }

  // 5. Invalid Password Rejection
  let invalidPassCaught = false;
  try {
    await authenticateUser({
      identifier: "superadmin",
      password: "IncorrectPassword!",
    });
  } catch {
    invalidPassCaught = true;
  }
  assert(invalidPassCaught, "Invalid password login is rejected with error");

  // 6. Non-existent User Rejection
  let nonExistentUserCaught = false;
  try {
    await authenticateUser({
      identifier: "nonexistent_user_999@erp.local",
      password: "anypassword",
    });
  } catch {
    nonExistentUserCaught = true;
  }
  assert(nonExistentUserCaught, "Non-existent user login is rejected with error");

  // 7. JWT Session Token Generation & Verification
  if (superAdminSession) {
    const signedToken = await createSessionToken(superAdminSession);
    const decoded = await verifySessionToken(signedToken);
    assert(
      decoded !== null && decoded.username === "superadmin" && decoded.roles.includes("SUPER_ADMIN"),
      "JWT Session token creates and verifies securely with jose"
    );
  }

  // 8. Password Hash is NOT Leaked in User Lookup
  const userRecord = await findUserById(1);
  assert(
    userRecord !== null && !("password_hash" in (userRecord as unknown as Record<string, unknown>)),
    "Sanitized user query does not leak password_hash"
  );

  // 9. Server-Side Guard: requireAuth
  let unauthCaught = false;
  try {
    requireAuth(null);
  } catch (err) {
    unauthCaught = (err as Error & { statusCode?: number }).statusCode === 401;
  }
  assert(unauthCaught, "requireAuth guard throws 401 on null session");

  // 10. Server-Side Guard: requireRole
  if (financeSession && viewerSession) {
    // Finance user requesting FINANCE role -> PASS
    let financePass = false;
    try {
      requireRole(financeSession, "FINANCE");
      financePass = true;
    } catch {
      financePass = false;
    }
    assert(financePass, "requireRole permits user with required role (Finance -> FINANCE)");

    // Viewer user requesting FINANCE role -> FAIL 403
    let viewerBlocked = false;
    try {
      requireRole(viewerSession, "FINANCE");
    } catch (err) {
      viewerBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
    }
    assert(viewerBlocked, "requireRole strictly blocks user without required role (Viewer -> FINANCE = 403)");
  }

  // 11. Server-Side Guard: requirePermission
  if (financeSession && viewerSession) {
    // Finance user requesting finance.manage -> PASS
    let permPass = false;
    try {
      requirePermission(financeSession, PERMISSIONS.FINANCE_MANAGE);
      permPass = true;
    } catch {
      permPass = false;
    }
    assert(permPass, "requirePermission permits user with required permission (Finance -> finance.manage)");

    // Viewer user requesting finance.manage -> FAIL 403
    let permBlocked = false;
    try {
      requirePermission(viewerSession, PERMISSIONS.FINANCE_MANAGE);
    } catch (err) {
      permBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
    }
    assert(permBlocked, "requirePermission strictly blocks user without permission (Viewer -> finance.manage = 403)");
  }

  // 12. SuperAdmin Bypass Invariant
  if (superAdminSession) {
    let superAdminPermPass = false;
    try {
      requirePermission(superAdminSession, PERMISSIONS.FINANCE_MANAGE);
      requireRole(superAdminSession, "FINANCE");
      superAdminPermPass = true;
    } catch {
      superAdminPermPass = false;
    }
    assert(superAdminPermPass, "SUPER_ADMIN role inherently satisfies all role & permission authorization guards");
  }

  // 13. Company Scoping Guard
  if (financeSession) {
    // Scoped to Company 1 -> PASS
    assert(hasCompanyAccess(financeSession, 1), "hasCompanyAccess confirms access to permitted Company 1");
    // Access to non-assigned Company 999 -> FAIL
    assert(!hasCompanyAccess(financeSession, 999), "hasCompanyAccess rejects access to unauthorized Company 999");
  }

  console.log("==================================================");
  console.log(`PHASE 03 SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("==================================================");

  if (passedTests === totalTests) {
    console.log("PHASE 03 RESULT: ALL ACCEPTANCE TESTS PASSED (100%)");
    process.exit(0);
  } else {
    console.error("PHASE 03 RESULT: FAIL — STOPPING AS REQUIRED.");
    process.exit(1);
  }
}

runAuthRbacTests().catch((err) => {
  console.error("Auth & RBAC tests failed with fatal error:", err);
  process.exit(1);
});
