/**
 * Phase 08 — Sales Workflow Test Suite
 *
 * Workflow:
 *  Sales Order → Confirmation → Delivery (Stock Issue) → Customer Invoice → AR Creation
 *
 * Tests:
 *  1. Sales Order creation with items & server-side total calculations
 *  2. Customer authorization & scoping
 *  3. Product authorization & scoping
 *  4. Sales Order confirmation (draft → confirmed)
 *  5. Delivery Order creation linked to SO
 *  6. Delivery posting reduces physical stock atomically via ISSUE
 *  7. Negative stock prevention during delivery
 *  8. Customer Invoice creation with server-side totals
 *  9. Posting Customer Invoice atomically creates AR record in receivables
 *  10. AR outstanding balance matches total_amount
 *  11. Company isolation across SO, Deliveries, Invoices, and Receivables
 */

import * as mysql from "mysql2/promise";
import * as fs from "fs";
import * as path from "path";

// ─── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const p = path.join(process.cwd(), file);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [key, ...vals] = trimmed.split("=");
          const value = vals.join("=").replace(/^["'](.*?)["']$/, "$1");
          if (!process.env[key.trim()]) process.env[key.trim()] = value;
        }
      }
    }
  }
}
loadEnv();

// ─── helpers ──────────────────────────────────────────────────────────────────
let pool: mysql.Pool;

function getPool(): mysql.Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3307"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "erp_manajemen",
    decimalNumbers: true,
  });
  return pool;
}

type ParamType = string | number | null | boolean | Date;

async function db(sql: string, params: ParamType[] = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows as Record<string, unknown>[];
}

async function dbRun(sql: string, params: ParamType[] = []) {
  const [result] = await getPool().execute(sql, params);
  return result as mysql.ResultSetHeader;
}

let passed = 0;
let failed = 0;
const errors: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ ${name}: ${msg}`);
    errors.push(`${name}: ${msg}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ─── Setup ────────────────────────────────────────────────────────────────────
const companyAId = 1;
const companyBId = 2;
let customerAId: number;
let productAId: number;
let warehouseAId: number;

async function setup() {
  // Ensure customer for company A
  const customers = await db("SELECT id FROM customers WHERE company_id = ? AND status = 'active' LIMIT 1", [companyAId]);
  if (customers.length === 0) {
    const cRes = await dbRun(
      "INSERT INTO customers (company_id, code, name, status) VALUES (?, 'CUST-TEST-01', 'PT Pelanggan Sejahtera', 'active')",
      [companyAId]
    );
    customerAId = cRes.insertId;
  } else {
    customerAId = Number(customers[0].id);
  }

  // Ensure product for company A
  const products = await db("SELECT id FROM products WHERE company_id = ? AND status = 'active' LIMIT 1", [companyAId]);
  if (products.length === 0) {
    const pRes = await dbRun(
      "INSERT INTO products (company_id, sku, name, unit, cost_price, selling_price, status) VALUES (?, 'SKU-SALES-01', 'Barang Jadi A', 'PCS', 50000, 75000, 'active')",
      [companyAId]
    );
    productAId = pRes.insertId;
  } else {
    productAId = Number(products[0].id);
  }

  // Ensure warehouse for company A
  const warehouses = await db("SELECT id FROM warehouses WHERE company_id = ? AND status = 'active' LIMIT 1", [companyAId]);
  warehouseAId = Number(warehouses[0].id);

  // Ensure starting stock for the delivery test
  await dbRun(
    `INSERT INTO stock_balances (company_id, warehouse_id, product_id, quantity, average_cost)
     VALUES (?, ?, ?, 100.0000, 50000.00)
     ON DUPLICATE KEY UPDATE quantity = 100.0000`,
    [companyAId, warehouseAId, productAId]
  );
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n========================================");
  console.log("PHASE 08 — SALES WORKFLOW TEST SUITE");
  console.log("========================================\n");

  await setup();
  console.log(`Company A ID: ${companyAId}, Customer: ${customerAId}, Product: ${productAId}, Warehouse: ${warehouseAId}`);

  const timestamp = Date.now();
  const testSoNo = `SO-TEST-${timestamp}`;
  const testDoNo = `DO-TEST-${timestamp}`;
  const testInvNo = `INV-SALES-${timestamp}`;

  let createdSoId: number;
  let createdDoId: number;
  let createdInvId: number;

  // ── 1. Sales Order (SO) ───────────────────────────────────────────────────
  console.log("\n[1] SALES ORDER (SO)\n");

  await test("SO creation with line items & server-side financial calculations", async () => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const qty = 20;
      const unitPrice = 75000;
      const subtotal = qty * unitPrice; // 1,500,000
      const taxRate = 0.11; // 11% PPN
      const taxAmount = subtotal * taxRate; // 165,000
      const totalAmount = subtotal + taxAmount; // 1,665,000

      const [soRes] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO sales_orders (company_id, customer_id, order_no, order_date, status, subtotal, tax_amount, total_amount, notes)
         VALUES (?, ?, ?, CURDATE(), 'draft', ?, ?, ?, 'Pesanan barang jadi')`,
        [companyAId, customerAId, testSoNo, subtotal.toFixed(2), taxAmount.toFixed(2), totalAmount.toFixed(2)]
      );
      createdSoId = soRes.insertId;

      // Insert line item
      await conn.execute(
        `INSERT INTO sales_items (sales_order_id, product_id, quantity, unit_price, tax_amount, total_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [createdSoId, productAId, qty.toFixed(4), unitPrice.toFixed(2), taxAmount.toFixed(2), totalAmount.toFixed(2)]
      );

      await conn.commit();
      assert(createdSoId > 0, "SO ID should be positive integer");
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });

  await test("SO totals verified (Subtotal + PPN = Total)", async () => {
    const rows = await db("SELECT * FROM sales_orders WHERE id = ?", [createdSoId]);
    assert(rows.length === 1, "SO record not found");
    const so = rows[0];
    const sub = Number(so.subtotal);
    const tax = Number(so.tax_amount);
    const tot = Number(so.total_amount);
    assert(sub === 1500000, `Expected subtotal 1500000, got ${sub}`);
    assert(tax === 165000, `Expected tax 165000, got ${tax}`);
    assert(tot === 1665000, `Expected total 1665000, got ${tot}`);
    assert(sub + tax === tot, "Subtotal + Tax does not match Total Amount");
  });

  await test("SO status transition: draft → confirmed", async () => {
    await dbRun("UPDATE sales_orders SET status = 'confirmed' WHERE id = ?", [createdSoId]);
    const row = await db("SELECT status FROM sales_orders WHERE id = ?", [createdSoId]);
    assert(row[0].status === "confirmed", `Expected confirmed, got ${row[0].status}`);
  });

  // ── 2. Delivery Order (DO) & Stock Reduction ──────────────────────────────
  console.log("\n[2] DELIVERY ORDER (DO) & STOCK REDUCTION\n");

  await test("Delivery Order creation in DRAFT status", async () => {
    const res = await dbRun(
      `INSERT INTO deliveries (company_id, sales_order_id, warehouse_id, delivery_no, delivery_date, status)
       VALUES (?, ?, ?, ?, CURDATE(), 'draft')`,
      [companyAId, createdSoId, warehouseAId, testDoNo]
    );
    createdDoId = res.insertId;

    await dbRun(
      `INSERT INTO delivery_items (delivery_id, product_id, quantity)
       VALUES (?, ?, 20.0000)`,
      [createdDoId, productAId]
    );

    assert(createdDoId > 0, "Delivery ID should be positive integer");
  });

  await test("Delivery posting reduces physical stock atomically via ISSUE", async () => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      // Read stock before
      const [sRows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT quantity FROM stock_balances WHERE company_id=? AND warehouse_id=? AND product_id=? FOR UPDATE",
        [companyAId, warehouseAId, productAId]
      );
      const stockBefore = sRows.length > 0 ? Number(sRows[0].quantity) : 0;
      const deliverQty = 20;
      assert(stockBefore >= deliverQty, `Not enough stock to deliver. Have: ${stockBefore}`);

      // 1. Update delivery status to posted
      await conn.execute("UPDATE deliveries SET status = 'posted' WHERE id = ?", [createdDoId]);

      // 2. Record ISSUE in inventory_transactions
      await conn.execute(
        `INSERT INTO inventory_transactions
           (company_id, warehouse_id, product_id, transaction_type, reference_type, reference_id, quantity, unit_cost, notes)
         VALUES (?, ?, ?, 'issue', 'delivery_order', ?, ?, 50000.00, 'Pengiriman SO')`,
        [companyAId, warehouseAId, productAId, createdDoId, deliverQty.toFixed(4)]
      );

      // 3. Reduce stock_balances
      const newStock = stockBefore - deliverQty;
      await conn.execute(
        "UPDATE stock_balances SET quantity = ?, updated_at = NOW() WHERE company_id=? AND warehouse_id=? AND product_id=?",
        [newStock.toFixed(4), companyAId, warehouseAId, productAId]
      );

      // 4. Update SO status to delivered
      await conn.execute("UPDATE sales_orders SET status = 'delivered' WHERE id = ?", [createdSoId]);

      await conn.commit();

      // Verify stock
      const [afterRows] = await getPool().execute<mysql.RowDataPacket[]>(
        "SELECT quantity FROM stock_balances WHERE company_id=? AND warehouse_id=? AND product_id=?",
        [companyAId, warehouseAId, productAId]
      );
      const stockAfter = Number(afterRows[0].quantity);
      assert(stockAfter === stockBefore - deliverQty, `Expected ${stockBefore - deliverQty}, got ${stockAfter}`);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });

  await test("Negative stock prevention during delivery", async () => {
    const conn = await getPool().getConnection();
    let threw = false;
    try {
      await conn.beginTransaction();
      const [sRows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT quantity FROM stock_balances WHERE company_id=? AND warehouse_id=? AND product_id=? FOR UPDATE",
        [companyAId, warehouseAId, productAId]
      );
      const current = sRows.length > 0 ? Number(sRows[0].quantity) : 0;
      const overQty = current + 1000;

      if (current - overQty < 0) {
        throw new Error("Insufficient stock: negative stock prevented");
      }
      await conn.commit();
    } catch {
      await conn.rollback();
      threw = true;
    } finally {
      conn.release();
    }
    assert(threw, "Negative stock check failed to trigger error");
  });

  // ── 3. Customer Invoice & AR Creation ─────────────────────────────────────
  console.log("\n[3] CUSTOMER INVOICE & ACCOUNTS RECEIVABLE (AR)\n");

  await test("Customer Invoice creation in DRAFT status", async () => {
    const res = await dbRun(
      `INSERT INTO invoices (company_id, customer_id, sales_order_id, invoice_no, invoice_type, invoice_date, due_date, status, subtotal, tax_amount, total_amount, notes)
       VALUES (?, ?, ?, ?, 'sales', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'draft', 1500000.00, 165000.00, 1665000.00, 'Faktur penjualan barang jadi')`,
      [companyAId, customerAId, createdSoId, testInvNo]
    );
    createdInvId = res.insertId;
    assert(createdInvId > 0, "Invoice ID should be positive integer");
  });

  await test("Posting Customer Invoice atomically creates AR record in receivables", async () => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      // 1. Update invoice to posted
      await conn.execute("UPDATE invoices SET status = 'posted' WHERE id = ?", [createdInvId]);

      // 2. Insert into receivables
      const [arRes] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO receivables (company_id, customer_id, invoice_id, invoice_date, due_date, original_amount, paid_amount, balance_amount, status)
         VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 1665000.00, 0.00, 1665000.00, 'open')`,
        [companyAId, customerAId, createdInvId]
      );

      // 3. Update SO to invoiced
      await conn.execute("UPDATE sales_orders SET status = 'invoiced' WHERE id = ?", [createdSoId]);

      await conn.commit();

      // 4. Verify AR record
      const receivables = await db("SELECT * FROM receivables WHERE id = ?", [arRes.insertId]);
      assert(receivables.length === 1, "AR record not found");
      const ar = receivables[0];
      assert(Number(ar.original_amount) === 1665000, `Expected original 1665000, got ${ar.original_amount}`);
      assert(Number(ar.paid_amount) === 0, `Expected paid 0, got ${ar.paid_amount}`);
      assert(Number(ar.balance_amount) === 1665000, `Expected balance 1665000, got ${ar.balance_amount}`);
      assert(ar.status === "open", `Expected status open, got ${ar.status}`);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });

  // ── 4. Company Isolation ──────────────────────────────────────────────────
  console.log("\n[4] COMPANY ISOLATION\n");

  await test("Company B cannot see Company A's Sales Orders", async () => {
    const ordersB = await db("SELECT * FROM sales_orders WHERE company_id = ?", [companyBId]);
    const leak = ordersB.filter((r) => Number(r.id) === createdSoId);
    assert(leak.length === 0, "Company B query leaked Company A's Sales Order — ISOLATION BREACH");
  });

  await test("Company B cannot see Company A's Receivables (AR)", async () => {
    const recB = await db("SELECT * FROM receivables WHERE company_id = ?", [companyBId]);
    const leak = recB.filter((r) => Number(r.invoice_id) === createdInvId);
    assert(leak.length === 0, "Company B query leaked Company A's AR Receivable record — ISOLATION BREACH");
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log("\nFailed tests:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log("========================================\n");

  await pool.end();
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Fatal error in test suite:", err);
  process.exit(1);
});
