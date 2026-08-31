import "dotenv/config";
import mariadb from "mariadb";

async function test() {
  const connectionString = process.env.DATABASE_URL;
  console.log("Testing connection to:", connectionString);
  const url = new URL(connectionString!);

  try {
    const conn = await mariadb.createConnection({
      host: url.hostname,
      port: parseInt(url.port || "3306"),
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
    });
    console.log("Direct MariaDB connection successful!");
    await conn.end();
  } catch (error) {
    console.error("Direct MariaDB connection failed:", error);
  }
}

test();
