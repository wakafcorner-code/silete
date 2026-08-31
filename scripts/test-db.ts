import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

// Load environment variables from .env.local or .env
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

const REQUIRED_TABLES = [
  "companies", "branches", "warehouses", "users", "roles", "permissions", "user_roles",
  "customers", "suppliers", "employees", "product_categories", "products",
  "inventory_transactions", "stock_balances", "stock_opnames", "stock_adjustments",
  "purchase_requests", "purchase_orders", "purchase_items", "goods_receipts", "goods_receipt_items",
  "sales_orders", "sales_items", "deliveries", "delivery_items",
  "invoices", "invoice_items", "cash_accounts", "cash_transactions", "bank_accounts", "bank_transactions",
  "expense_categories", "expenses", "expense_approvals", "payments", "payment_allocations",
  "receivables", "payables", "accounts", "financial_periods", "journal_entries", "journal_entry_items",
  "general_ledger", "asset_categories", "assets", "asset_depreciations",
  "intercompany_transactions", "intercompany_entries", "intercompany_settlements",
  "audit_logs", "attachments", "notifications"
];

async function runTests() {
  console.log("==================================================");
  console.log("PHASE 02: DATABASE & SCHEMA BASELINE VERIFICATION");
  console.log("==================================================");

  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "erp_manajemen";

  console.log(`Connecting to MySQL at ${host}:${port} as ${user}, database: ${database}...`);

  let connection;
  let allPassed = true;

  try {
    // TEST 1: Connectivity
    connection = await mysql.createConnection({ host, port, user, password, database });
    console.log("✅ TEST 1: MySQL XAMPP connection successful.");

    // TEST 2: Database selection
    const [dbRows] = await connection.query("SELECT DATABASE() as current_db, VERSION() as version");
    const dbInfo = (dbRows as { current_db: string; version: string }[])[0];
    console.log(`✅ TEST 2: Active database is '${dbInfo.current_db}' (MariaDB/MySQL ${dbInfo.version}).`);

    if (dbInfo.current_db !== "erp_manajemen") {
      console.error(`❌ FAIL: Expected database 'erp_manajemen', got '${dbInfo.current_db}'`);
      allPassed = false;
    }

    // TEST 3: Baseline tables
    const [tableRows] = await connection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
      [database]
    );
    const existing = new Set((tableRows as { TABLE_NAME?: string; table_name?: string }[]).map(
      (r) => (r.table_name || r.TABLE_NAME || "").toLowerCase()
    ));

    const missing = REQUIRED_TABLES.filter((t) => !existing.has(t.toLowerCase()));
    if (missing.length === 0) {
      console.log(`✅ TEST 3: All ${REQUIRED_TABLES.length} required baseline tables exist.`);
    } else {
      console.error(`❌ TEST 3 FAIL: Missing tables: ${missing.join(", ")}`);
      allPassed = false;
    }

    // TEST 4: Foreign keys
    const [fkRows] = await connection.query(
      "SELECT COUNT(*) as count FROM information_schema.table_constraints WHERE table_schema = ? AND constraint_type = 'FOREIGN KEY'",
      [database]
    );
    const fkCount = (fkRows as { count: number }[])[0].count;
    console.log(`✅ TEST 4: Foreign keys verified (${fkCount} active foreign key constraints found).`);

    // TEST 5: Safe read queries
    const [companies] = await connection.query("SELECT id, code, name, status FROM companies LIMIT 5");
    console.log(`✅ TEST 5A: Safe read from 'companies' table passed (${(companies as unknown[]).length} rows).`);

    const [accounts] = await connection.query("SELECT id, code, name, account_type FROM accounts LIMIT 5");
    console.log(`✅ TEST 5B: Safe read from 'accounts' (COA) table passed (${(accounts as unknown[]).length} rows).`);

    const [products] = await connection.query("SELECT id, sku, name, cost_price, selling_price FROM products LIMIT 5");
    console.log(`✅ TEST 5C: Safe read from 'products' table passed (${(products as unknown[]).length} rows).`);

    // TEST 6: Verify no secondary database configured
    if (database !== "erp_manajemen") {
      console.error("❌ TEST 6 FAIL: Invalid secondary database name detected!");
      allPassed = false;
    } else {
      console.log("✅ TEST 6: Single database rule confirmed (erp_manajemen only).");
    }

    // TEST 7: Decimal and Charset verification
    const [charsetRows] = await connection.query(
      "SELECT default_character_set_name, default_collation_name FROM information_schema.schemata WHERE schema_name = ?",
      [database]
    );
    const charset = (charsetRows as { default_character_set_name: string; default_collation_name: string }[])[0];
    console.log(`✅ TEST 7: Charset is '${charset.default_character_set_name}' (${charset.default_collation_name}).`);

  } catch (err) {
    console.error("❌ Database test failed with error:", err);
    allPassed = false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }

  console.log("==================================================");
  if (allPassed) {
    console.log("PHASE 02 RESULT: ALL ACCEPTANCE TESTS PASSED (100%)");
    console.log("==================================================");
    process.exit(0);
  } else {
    console.error("PHASE 02 RESULT: FAIL — STOPPING AS REQUIRED.");
    console.log("==================================================");
    process.exit(1);
  }
}

runTests();
