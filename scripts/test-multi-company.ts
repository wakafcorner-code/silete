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

import { UserSessionPayload } from "../src/services/session-service";
import { listPermittedCompanies, getCompanyById } from "../src/services/company-service";
import { listBranches, getBranchById } from "../src/services/branch-service";
import { listWarehouses, getWarehouseById } from "../src/services/warehouse-service";
import { resolveCompanyScope } from "../src/services/company-context-service";
import { PERMISSIONS } from "../src/config/permissions";

// Mock User Sessions
const userCompanyA: UserSessionPayload = {
  userId: 101,
  username: "user.compA",
  email: "userA@companyA.local",
  name: "User Company A Only",
  roles: ["ADMIN"],
  permissions: [
    PERMISSIONS.COMPANY_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  companyIds: [1], // Scoped strictly to Company 1
  defaultCompanyId: 1,
};

const userCompanyB: UserSessionPayload = {
  userId: 102,
  username: "user.compB",
  email: "userB@companyB.local",
  name: "User Company B Only",
  roles: ["ADMIN"],
  permissions: [
    PERMISSIONS.COMPANY_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  companyIds: [2], // Scoped strictly to Company 2
  defaultCompanyId: 2,
};

const superAdminUser: UserSessionPayload = {
  userId: 1,
  username: "superadmin",
  email: "superadmin@erp.local",
  name: "Super Administrator",
  roles: ["SUPER_ADMIN"],
  permissions: Object.values(PERMISSIONS),
  companyIds: [1, 2],
  defaultCompanyId: 1,
};

async function runMultiCompanyTests() {
  console.log("==================================================");
  console.log("PHASE 04: MULTI-COMPANY ISOLATION & SECURITY SUITE");
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

  // 1. Company A Permitted List Isolation
  const companiesA = await listPermittedCompanies(userCompanyA);
  assert(
    companiesA.length === 1 && companiesA[0].id === 1,
    "User A can ONLY see Company A in permitted company list",
    `Found: ${companiesA.map((c) => c.id).join(",")}`
  );

  // 2. Company B Permitted List Isolation
  const companiesB = await listPermittedCompanies(userCompanyB);
  assert(
    companiesB.length === 1 && companiesB[0].id === 2,
    "User B can ONLY see Company B in permitted company list",
    `Found: ${companiesB.map((c) => c.id).join(",")}`
  );

  // 3. SuperAdmin Permitted List (Can see both Company A and B)
  const superAdminCompanies = await listPermittedCompanies(superAdminUser);
  assert(
    superAdminCompanies.length >= 2 &&
      superAdminCompanies.some((c) => c.id === 1) &&
      superAdminCompanies.some((c) => c.id === 2),
    "SuperAdmin can see all companies (Company A & Company B)"
  );

  // 4. Cross-Company IDOR: User A accessing Company B by ID
  let crossCompanyBlocked = false;
  try {
    await getCompanyById(userCompanyA, 2); // Attempt to access Company 2
  } catch (err) {
    crossCompanyBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(crossCompanyBlocked, "Cross-Company IDOR: User A is rejected (403) when requesting Company B");

  // 5. Cross-Company IDOR: User B accessing Company A by ID
  let crossCompanyBBlocked = false;
  try {
    await getCompanyById(userCompanyB, 1); // Attempt to access Company 1
  } catch (err) {
    crossCompanyBBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(crossCompanyBBlocked, "Cross-Company IDOR: User B is rejected (403) when requesting Company A");

  // 6. Branch Isolation: User A listing branches
  const branchesA = await listBranches(userCompanyA);
  assert(
    branchesA.every((b) => b.company_id === 1) && branchesA.length > 0,
    "Branch Isolation: User A only receives branches owned by Company 1"
  );

  // 7. Branch Isolation: User B listing branches
  const branchesB = await listBranches(userCompanyB);
  assert(
    branchesB.every((b) => b.company_id === 2) && branchesB.length > 0,
    "Branch Isolation: User B only receives branches owned by Company 2"
  );

  // 8. Cross-Company Branch Access (IDOR via record ID)
  let branchIdorBlocked = false;
  try {
    // Branch 2 belongs to Company 2. User A attempts to read Branch 2.
    await getBranchById(userCompanyA, 2);
  } catch (err) {
    branchIdorBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(branchIdorBlocked, "Branch IDOR: User A is rejected (403) when reading Company B's Branch #2");

  // 9. Warehouse Isolation: User A listing warehouses
  const warehousesA = await listWarehouses(userCompanyA);
  assert(
    warehousesA.every((w) => w.company_id === 1) && warehousesA.length > 0,
    "Warehouse Isolation: User A only receives warehouses owned by Company 1"
  );

  // 10. Warehouse Isolation: User B listing warehouses
  const warehousesB = await listWarehouses(userCompanyB);
  assert(
    warehousesB.every((w) => w.company_id === 2) && warehousesB.length > 0,
    "Warehouse Isolation: User B only receives warehouses owned by Company 2"
  );

  // 11. Cross-Company Warehouse Access (IDOR via record ID)
  let whIdorBlocked = false;
  try {
    // Warehouse 2 belongs to Company 2. User A attempts to read Warehouse 2.
    await getWarehouseById(userCompanyA, 2);
  } catch (err) {
    whIdorBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(whIdorBlocked, "Warehouse IDOR: User A is rejected (403) when reading Company B's Warehouse #2");

  // 12. Query Tampering: User A passing ?companyId=2 in listBranches
  let paramTamperBlocked = false;
  try {
    await listBranches(userCompanyA, 2); // Tampered parameter
  } catch (err) {
    paramTamperBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(
    paramTamperBlocked,
    "Parameter Tampering: Server rejects (403) User A trying to query branches with ?companyId=2"
  );

  // 13. Query Tampering: User A passing ?companyId=2 in listWarehouses
  let whTamperBlocked = false;
  try {
    await listWarehouses(userCompanyA, 2); // Tampered parameter
  } catch (err) {
    whTamperBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(
    whTamperBlocked,
    "Parameter Tampering: Server rejects (403) User A trying to query warehouses with ?companyId=2"
  );

  // 14. Company Context Resolution Integrity
  const scopeA = await resolveCompanyScope(userCompanyA);
  const scopeB = await resolveCompanyScope(userCompanyB);
  assert(
    scopeA === 1 && scopeB === 2,
    "resolveCompanyScope securely maps single-company user to their permitted company only"
  );

  // 15. SuperAdmin Cross-Company Switch
  const superScopeA = await resolveCompanyScope(superAdminUser, 1);
  const superScopeB = await resolveCompanyScope(superAdminUser, 2);
  assert(
    superScopeA === 1 && superScopeB === 2,
    "SuperAdmin can legitimately resolve and switch between Company 1 and Company 2"
  );

  console.log("==================================================");
  console.log(`PHASE 04 SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("==================================================");

  if (passedTests === totalTests) {
    console.log("PHASE 04 RESULT: ALL ACCEPTANCE TESTS PASSED (100%)");
    process.exit(0);
  } else {
    console.error("PHASE 04 RESULT: FAIL — STOPPING AS REQUIRED.");
    process.exit(1);
  }
}

runMultiCompanyTests().catch((err) => {
  console.error("Multi-company test suite failed with fatal error:", err);
  process.exit(1);
});
