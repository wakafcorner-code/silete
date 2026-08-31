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
        console.log("Creating default roles...");
        await conn.execute("INSERT IGNORE INTO roles (id, name, description) VALUES (1, 'SUPER_ADMIN', 'Root access to all systems')");

        console.log("Creating superadmin user...");
        const passHash = await bcrypt.hash("SuperAdmin@123456", 10);

        const [userRes] = await conn.execute(
            "INSERT IGNORE INTO users (id, username, email, password_hash, name, status) VALUES (?, ?, ?, ?, ?, ?)",
            [1, 'superadmin', 'admin@erp.local', passHash, 'Super Administrator', 'active']
        );

        console.log("Assigning role to user...");
        await conn.execute(
            "INSERT IGNORE INTO user_roles (user_id, role_id, company_id) VALUES (1, 1, 0)"
        );

        console.log("SUCCESS! You can now login with:");
        console.log("User: superadmin");
        console.log("Pass: SuperAdmin@123456");

    } catch (err) {
        console.error("FAILED:", err);
    } finally {
        await conn.end();
    }
}

main();
