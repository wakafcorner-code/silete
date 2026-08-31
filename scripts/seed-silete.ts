import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Seeding SILETE master data...");

  // 1. Companies
  const companies = [
    { code: "DTM", name: "CV DEPATI TININDO MINING" },
    { code: "STA", name: "CV SURYA TIMAH ANDALAN" },
  ];

  for (const comp of companies) {
    await prisma.companies.upsert({
      where: { code: comp.code },
      update: { name: comp.name, status: "active" },
      create: {
        code: comp.code,
        name: comp.name,
        status: "active",
        currency_code: "IDR",
        timezone: "Asia/Jakarta"
      },
    });
    console.log(`Upserted company: ${comp.name}`);
  }

  // Get the first company as default for partners if needed
  const dtm = await prisma.companies.findUnique({ where: { code: "DTM" } });
  if (!dtm) throw new Error("DTM company not found after upsert");

  // 2. Partners (Initial Suppliers)
  const partners = ["Asu", "Wandi", "Feris", "Asui"];
  for (const name of partners) {
    const code = name.toUpperCase().replace(/\s+/g, "_");
    await prisma.suppliers.upsert({
      where: {
        company_id_code: {
          company_id: dtm.id,
          code: code
        }
      },
      update: { name, status: "active" },
      create: {
        company_id: dtm.id,
        code: code,
        name: name,
        status: "active",
      },
    });
    console.log(`Upserted partner: ${name}`);
  }

  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
