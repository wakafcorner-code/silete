import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
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

const SEED_USERS = [
  {
    username: "superadmin",
    email: "superadmin@erp.local",
    name: "Super Administrator",
    password: "Super@123",
    role: "SUPER_ADMIN",
  },
  {
    username: "admin",
    email: "admin@erp.local",
    name: "System Administrator",
    password: "Admin@123",
    role: "ADMIN",
  },
  {
    username: "finance",
    email: "finance@erp.local",
    name: "Finance & Accounting Officer",
    password: "Finance@123",
    role: "FINANCE",
  },
  {
    username: "warehouse",
    email: "warehouse@erp.local",
    name: "Warehouse Manager",
    password: "Gudang@123",
    role: "WAREHOUSE",
  },
  {
    username: "viewer",
    email: "viewer@erp.local",
    name: "Auditor & Read-Only Viewer",
    password: "Viewer@123",
    role: "VIEWER",
  },
];

async function seed() {
  console.log("==================================================");
  console.log("SEEDING RBAC USERS & ROLES IN erp_manajemen");
  console.log("==================================================");

  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "erp_manajemen";

  const conn = await mysql.createConnection({ host, port, user, password, database });

  try {
    console.log("Ensuring roles exist...");
    const rolesToEnsure = [
      { id: 1, name: "SUPER_ADMIN", desc: "Full system administration" },
      { id: 2, name: "ADMIN", desc: "System administrator" },
      { id: 3, name: "FINANCE", desc: "Finance and accounting user" },
      { id: 4, name: "WAREHOUSE", desc: "Warehouse and inventory user" },
      { id: 5, name: "VIEWER", desc: "Read-only user" },
    ];

    for (const r of rolesToEnsure) {
      await conn.query("INSERT IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)", [r.id, r.name, r.desc]);
    }

    // Update SEED_DATA to use these names
    const SEED_DATA = [
      { username: "superadmin", email: "superadmin@erp.local", name: "Super Administrator", password: "Super@123", role: "SUPER_ADMIN" },
      { username: "admin", email: "admin@erp.local", name: "System Administrator", password: "Admin@123", role: "ADMIN" },
      { username: "finance", email: "finance@erp.local", name: "Finance Manager", password: "Finance@123", role: "FINANCE" },
      { username: "warehouse", email: "warehouse@erp.local", name: "Warehouse Manager", password: "Gudang@123", role: "WAREHOUSE" },
      { username: "viewer", email: "viewer@erp.local", name: "Auditor Viewer", password: "Viewer@123", role: "VIEWER" },
    ];

    // Get roles map
    const [rolesRows] = await conn.query("SELECT id, name FROM roles");
    const roleMap = new Map<string, number>();
    for (const r of rolesRows as { id: number; name: string }[]) {
      roleMap.set(r.name, r.id);
    }

    // Get all active companies
    const [companyRows] = await conn.query("SELECT id FROM companies WHERE status = 'active'");
    const companyIds = (companyRows as { id: number }[]).map((c) => c.id);
    const defaultCompanyId = companyIds[0] || 0;

    for (const u of SEED_DATA) {
      const roleId = roleMap.get(u.role);
      if (!roleId) {
        console.error(`Role ${u.role} not found in database!`);
        continue;
      }

      const passwordHash = await bcrypt.hash(u.password, 10);

      // Check if user exists
      const [existing] = await conn.query<{ id: number }[] & mysql.RowDataPacket[]>(
        "SELECT id FROM users WHERE username = ? OR email = ?",
        [u.username, u.email]
      );

      let userId: number;

      if (existing.length > 0) {
        userId = existing[0].id;
        await conn.query(
          "UPDATE users SET password_hash = ?, name = ?, status = 'active' WHERE id = ?",
          [passwordHash, u.name, userId]
        );
        console.log(`Updated user: ${u.username} (${u.role})`);
      } else {
        const [insertRes] = await conn.query<mysql.ResultSetHeader>(
          "INSERT INTO users (username, email, password_hash, name, status) VALUES (?, ?, ?, ?, 'active')",
          [u.username, u.email, passwordHash, u.name]
        );
        userId = insertRes.insertId;
        console.log(`Created user: ${u.username} (${u.role})`);
      }

      // Assign user_roles for relevant companies
      const targetCompanyIds = u.role === "SUPER_ADMIN" ? companyIds : [defaultCompanyId];
      for (const compId of targetCompanyIds) {
        const [existingRole] = await conn.query<{ user_id: number }[] & mysql.RowDataPacket[]>(
          "SELECT user_id FROM user_roles WHERE user_id = ? AND role_id = ? AND company_id = ?",
          [userId, roleId, compId]
        );

        if (existingRole.length === 0) {
          await conn.query(
            "INSERT INTO user_roles (user_id, role_id, company_id) VALUES (?, ?, ?)",
            [userId, roleId, compId]
          );
          console.log(`  Assigned role ${u.role} (Company ${compId}) to ${u.username}`);
        }
      }
    }

    console.log("==================================================");
    console.log("ALL RBAC USERS SUCCESSFULLY SEEDED.");
    console.log("==================================================");
  } finally {
    await conn.end();
  }
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
