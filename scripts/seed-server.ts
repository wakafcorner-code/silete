/**
 * ERP Manajemen — Emergency Server Seed
 * Force inject Super Admin using direct credentials.
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

async function main() {
    // FORCE CONFIG FOR SERVER
    const config = {
        host: '127.0.0.1',
        user: 'erp_manajemen',
        password: 'Mdwz4HCFzzKAz6Ah',
        database: 'erp_manajemen',
        port: 3306
    };

    console.log("Connecting to Database:", config.database);
    const conn = await mysql.createConnection(config);

    try {
        console.log("Ensuring roles exist...");
        const roles = [
            [1, 'SUPER_ADMIN', 'Full Access'],
            [2, 'ADMIN', 'Company Admin'],
            [3, 'FINANCE_MANAGER', 'Finance Dept'],
            [4, 'WAREHOUSE_ADMIN', 'Gudang Dept'],
            [5, 'VIEWER', 'Read Only']
        ];
        for (const [id, name, desc] of roles) {
            await conn.execute("INSERT IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)", [id, name, desc]);
        }

        console.log("Creating/Updating users...");
        const users = [
            [1, 'superadmin', 'admin@erp.local', 'Super@123', 'Super Administrator', 1],
            [2, 'admin', 'store@erp.local', 'Admin@123', 'Admin Toko', 2],
            [3, 'finance', 'finance@erp.local', 'Finance@123', 'Staf Keuangan', 3],
            [4, 'warehouse', 'warehouse@erp.local', 'Gudang@123', 'Staf Gudang', 4],
            [5, 'viewer', 'guest@erp.local', 'Viewer@123', 'Guest Viewer', 5],
        ];

        for (const [id, username, email, pass, name, roleId] of users) {
            console.log(`Processing user: ${username}...`);
            const passHash = await bcrypt.hash(pass as string, 10);

            await conn.execute(
                `INSERT INTO users (id, username, email, password_hash, name, status)
                 VALUES (?, ?, ?, ?, ?, 'active')
                 ON DUPLICATE KEY UPDATE
                    password_hash = VALUES(password_hash),
                    status = 'active'`,
                [id, username, email, passHash, name]
            );

            // Assign roles to both active companies for the primary admin accounts
            // For this project: Company 3 (DTM) and Company 4 (STA)
            const activeCompanies = [3, 4];
            await conn.execute("DELETE FROM user_roles WHERE user_id = ?", [id]);

            for (const compId of activeCompanies) {
                await conn.execute(
                    "INSERT IGNORE INTO user_roles (user_id, role_id, company_id) VALUES (?, ?, ?)",
                    [id, roleId, compId]
                );
            }
        }

        console.log("SUCCESS! All accounts updated for DTM and STA entities.");

    } catch (err) {
        console.error("FAILED:", err);
    } finally {
        await conn.end();
    }
}

main();
