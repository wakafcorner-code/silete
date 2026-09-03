import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

async function main() {
    const config = {
        host: 'localhost',
        port: 3307,
        user: 'root',
        password: '',
        database: 'erp_manajemen'
    };

    const conn = await mysql.createConnection(config);
    const [rows] = await conn.execute("SELECT password_hash FROM users WHERE username='superadmin'");
    const user = (rows as any)[0];

    if (!user) {
        console.log("User not found");
        return;
    }

    const testPass = "Super@123";
    const isMatch = await bcrypt.compare(testPass, user.password_hash);

    console.log(`Testing password: ${testPass}`);
    console.log(`Hash in DB: ${user.password_hash}`);
    console.log(`Match? ${isMatch}`);

    await conn.end();
}

main();
