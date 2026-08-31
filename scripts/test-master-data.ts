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
import { PERMISSIONS } from "../src/config/permissions";
import {
  createCustomer,
  getCustomerById,
  updateCustomer,
  listCustomers,
} from "../src/services/customer-service";
import {
  createSupplier,
  getSupplierById,
  updateSupplier,
  listSuppliers,
} from "../src/services/supplier-service";
import {
  createEmployee,
  getEmployeeById,
  updateEmployee,
  listEmployees,
} from "../src/services/employee-service";
import {
  createProductCategory,
  getProductCategoryById,
  updateProductCategory,
  listProductCategories,
} from "../src/services/product-category-service";
import {
  createProduct,
  getProductById,
  updateProduct,
  listProducts,
} from "../src/services/product-service";
import { listAuditLogs } from "../src/services/audit-service";

const userCompanyA: UserSessionPayload = {
  userId: 1,
  username: "admin",
  email: "admin@erp.local",
  name: "Admin Company A",
  roles: ["ADMIN"],
  permissions: Object.values(PERMISSIONS),
  companyIds: [1],
  defaultCompanyId: 1,
};

const userCompanyB: UserSessionPayload = {
  userId: 6,
  username: "sales",
  email: "sales@erp.local",
  name: "Sales Company B",
  roles: ["ADMIN"],
  permissions: Object.values(PERMISSIONS),
  companyIds: [2],
  defaultCompanyId: 2,
};

async function runMasterDataTests() {
  console.log("==================================================");
  console.log("PHASE 05: MASTER DATA CRUD & ISOLATION TEST SUITE");
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

  // --- 1. CUSTOMERS ---
  const custCode = `CUST-${Date.now()}`;
  const createdCust = await createCustomer(userCompanyA, {
    code: custCode,
    name: "PT Mitra Sejahtera",
    phone: "08123456789",
    email: "contact@mitra.local",
    credit_limit: 50000000,
    payment_terms_days: 30,
    status: "active",
  });
  assert(createdCust.id > 0 && createdCust.code === custCode, "Customer CREATE in Company A");

  const fetchedCust = await getCustomerById(userCompanyA, createdCust.id);
  assert(
    fetchedCust !== null && fetchedCust.name === "PT Mitra Sejahtera",
    "Customer READ by ID in Company A"
  );

  await updateCustomer(userCompanyA, createdCust.id, {
    name: "PT Mitra Sejahtera Mandiri",
    credit_limit: 75000000,
  });
  const updatedCust = await getCustomerById(userCompanyA, createdCust.id);
  assert(
    updatedCust !== null && updatedCust.name === "PT Mitra Sejahtera Mandiri",
    "Customer UPDATE in Company A"
  );

  // Customer Duplicate Code Prevention
  let custDupBlocked = false;
  try {
    await createCustomer(userCompanyA, {
      code: custCode,
      name: "Duplicate Customer",
    });
  } catch {
    custDupBlocked = true;
  }
  assert(custDupBlocked, "Customer duplicate code rejected in Company A");

  // Customer Cross-Company Access Rejection
  let custCrossBlocked = false;
  try {
    await getCustomerById(userCompanyB, createdCust.id);
  } catch (err) {
    custCrossBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(custCrossBlocked, "Customer Cross-Company IDOR rejected (403)");

  // --- 2. SUPPLIERS ---
  const suppCode = `SUPP-${Date.now()}`;
  const createdSupp = await createSupplier(userCompanyA, {
    code: suppCode,
    name: "CV Sumber Berkah",
    phone: "08987654321",
    email: "sales@berkah.local",
    payment_terms_days: 14,
    status: "active",
  });
  assert(createdSupp.id > 0 && createdSupp.code === suppCode, "Supplier CREATE in Company A");

  const fetchedSupp = await getSupplierById(userCompanyA, createdSupp.id);
  assert(fetchedSupp !== null && fetchedSupp.name === "CV Sumber Berkah", "Supplier READ by ID");

  await updateSupplier(userCompanyA, createdSupp.id, {
    name: "CV Sumber Berkah Utama",
  });
  const updatedSupp = await getSupplierById(userCompanyA, createdSupp.id);
  assert(
    updatedSupp !== null && updatedSupp.name === "CV Sumber Berkah Utama",
    "Supplier UPDATE in Company A"
  );

  // Supplier Duplicate Code Prevention
  let suppDupBlocked = false;
  try {
    await createSupplier(userCompanyA, {
      code: suppCode,
      name: "Duplicate Supplier",
    });
  } catch {
    suppDupBlocked = true;
  }
  assert(suppDupBlocked, "Supplier duplicate code rejected in Company A");

  // Supplier Cross-Company Access Rejection
  let suppCrossBlocked = false;
  try {
    await getSupplierById(userCompanyB, createdSupp.id);
  } catch (err) {
    suppCrossBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(suppCrossBlocked, "Supplier Cross-Company IDOR rejected (403)");

  // --- 3. EMPLOYEES ---
  const empCode = `EMP-${Date.now()}`;
  const createdEmp = await createEmployee(userCompanyA, {
    employee_code: empCode,
    name: "Budi Santoso",
    position: "Senior Accountant",
    email: "budi@companya.local",
    status: "active",
  });
  assert(createdEmp.id > 0 && createdEmp.employee_code === empCode, "Employee CREATE in Company A");

  const fetchedEmp = await getEmployeeById(userCompanyA, createdEmp.id);
  assert(fetchedEmp !== null && fetchedEmp.name === "Budi Santoso", "Employee READ by ID");

  await updateEmployee(userCompanyA, createdEmp.id, {
    position: "Accounting Supervisor",
  });
  const updatedEmp = await getEmployeeById(userCompanyA, createdEmp.id);
  assert(
    updatedEmp !== null && updatedEmp.position === "Accounting Supervisor",
    "Employee UPDATE in Company A"
  );

  // Employee Duplicate Code Prevention
  let empDupBlocked = false;
  try {
    await createEmployee(userCompanyA, {
      employee_code: empCode,
      name: "Duplicate Employee",
    });
  } catch {
    empDupBlocked = true;
  }
  assert(empDupBlocked, "Employee duplicate code rejected in Company A");

  // Employee Cross-Company Access Rejection
  let empCrossBlocked = false;
  try {
    await getEmployeeById(userCompanyB, createdEmp.id);
  } catch (err) {
    empCrossBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(empCrossBlocked, "Employee Cross-Company IDOR rejected (403)");

  // --- 4. PRODUCT CATEGORIES ---
  const catCode = `CAT-${Date.now()}`;
  const createdCat = await createProductCategory(userCompanyA, {
    code: catCode,
    name: "Timah",
    status: "active",
  });
  assert(createdCat.id > 0 && createdCat.code === catCode, "Product Category CREATE in Company A");

  const fetchedCat = await getProductCategoryById(userCompanyA, createdCat.id);
  assert(fetchedCat !== null && fetchedCat.name === "Timah", "Product Category READ by ID");

  await updateProductCategory(userCompanyA, createdCat.id, {
    name: "Timah",
  });
  const updatedCat = await getProductCategoryById(userCompanyA, createdCat.id);
  assert(
    updatedCat !== null && updatedCat.name === "Timah",
    "Product Category UPDATE in Company A"
  );

  // --- 5. PRODUCTS ---
  const productSku = `SKU-${Date.now()}`;
  const createdProduct = await createProduct(userCompanyA, {
    sku: productSku,
    name: "Timah",
    category_id: createdCat.id,
    unit: "UNIT",
    cost_price: 8500000,
    selling_price: 11200000,
    minimum_stock: 5,
    track_inventory: true,
    status: "active",
  });
  assert(createdProduct.id > 0 && createdProduct.sku === productSku, "Product CREATE in Company A");

  const fetchedProd = await getProductById(userCompanyA, createdProduct.id);
  assert(
    fetchedProd !== null &&
      fetchedProd.name === "Timah" &&
      Number(fetchedProd.selling_price) === 11200000,
    "Product READ by ID with decimal price preservation"
  );

  await updateProduct(userCompanyA, createdProduct.id, {
    name: "Timah",
    selling_price: 11900000,
  });
  const updatedProd = await getProductById(userCompanyA, createdProduct.id);
  assert(
    updatedProd !== null && Number(updatedProd.selling_price) === 11900000,
    "Product UPDATE with decimal pricing in Company A"
  );

  // Product Duplicate SKU Prevention
  let skuDupBlocked = false;
  try {
    await createProduct(userCompanyA, {
      sku: productSku,
      name: "Duplicate Product",
    });
  } catch {
    skuDupBlocked = true;
  }
  assert(skuDupBlocked, "Product duplicate SKU rejected in Company A");

  // Product Cross-Company Access Rejection
  let prodCrossBlocked = false;
  try {
    await getProductById(userCompanyB, createdProduct.id);
  } catch (err) {
    prodCrossBlocked = (err as Error & { statusCode?: number }).statusCode === 403;
  }
  assert(prodCrossBlocked, "Product Cross-Company IDOR rejected (403)");

  // --- 6. SEARCH, FILTER & PAGINATION ---
  const searchResult = await listProducts(userCompanyA, { search: productSku });
  assert(
    searchResult.data.length === 1 && searchResult.data[0].sku === productSku,
    "Product search by SKU returns matching result"
  );

  const filterCatResult = await listProducts(userCompanyA, { categoryId: createdCat.id });
  assert(
    filterCatResult.data.length >= 1 &&
      filterCatResult.data.every((p) => p.category_id === createdCat.id),
    "Product filter by Category ID works correctly"
  );

  const paginationCustResult = await listCustomers(userCompanyA, { page: 1, limit: 10 });
  assert(
    paginationCustResult.pagination.page === 1 &&
      paginationCustResult.pagination.limit === 10 &&
      paginationCustResult.data.length <= 10,
    "Customer Pagination metadata (page, limit, total) is valid"
  );

  const listSuppResult = await listSuppliers(userCompanyA, { search: suppCode });
  assert(
    listSuppResult.data.length === 1 && listSuppResult.data[0].code === suppCode,
    "Supplier list with search by code works"
  );

  const listEmpResult = await listEmployees(userCompanyA, { search: empCode });
  assert(
    listEmpResult.data.length === 1 && listEmpResult.data[0].employee_code === empCode,
    "Employee list with search by code works"
  );

  const listCatResult = await listProductCategories(userCompanyA, { search: catCode });
  assert(
    listCatResult.data.length === 1 && listCatResult.data[0].code === catCode,
    "Product Category list with search by code works"
  );

  // --- 7. AUDIT LOG VALIDATION ---
  const auditLogsResult = await listAuditLogs(userCompanyA, { limit: 10 });
  assert(
    auditLogsResult.data.length > 0 &&
      auditLogsResult.data.some((l) => l.action === "CREATE" || l.action === "UPDATE"),
    "Audit Logs successfully recorded for master data mutations"
  );

  console.log("==================================================");
  console.log(`PHASE 05 SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("==================================================");

  if (passedTests === totalTests) {
    console.log("PHASE 05 RESULT: ALL ACCEPTANCE TESTS PASSED (100%)");
    process.exit(0);
  } else {
    console.error("PHASE 05 RESULT: FAIL — STOPPING AS REQUIRED.");
    process.exit(1);
  }
}

runMasterDataTests().catch((err) => {
  console.error("Master data test suite failed with fatal error:", err);
  process.exit(1);
});
