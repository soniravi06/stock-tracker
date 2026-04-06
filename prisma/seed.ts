import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Wipe existing data (dev only)
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  // ---------- SUPERADMIN ----------
  const superadminEmail = process.env.SUPERADMIN_EMAIL || "admin@example.com";
  const superadminPassword = process.env.SUPERADMIN_PASSWORD || "ChangeMe123!";
  const superadmin = await prisma.user.create({
    data: {
      email: superadminEmail,
      passwordHash: await bcrypt.hash(superadminPassword, 10),
      role: "superadmin",
      name: "Super Admin",
    },
  });
  console.log(`✓ Superadmin: ${superadmin.email} / ${superadminPassword}`);

  // ---------- SAMPLE ADMIN ----------
  const adminPassword = "Admin123!";
  const admin = await prisma.user.create({
    data: {
      email: "rajesh@firm.com",
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "admin",
      name: "Rajesh Sharma",
    },
  });
  console.log(`✓ Admin: ${admin.email} / ${adminPassword}`);

  // ---------- SAMPLE CLIENTS ----------
  const client1 = await prisma.client.create({
    data: {
      adminId: admin.id,
      name: "Amit Patel",
      email: "amit@example.com",
      phone: "+91-98765-43210",
      defaultCommissionType: "percentage",
      defaultCommissionValue: 0.5,
    },
  });

  const client2 = await prisma.client.create({
    data: {
      adminId: admin.id,
      name: "Priya Singh",
      email: "priya@example.com",
      phone: "+91-91234-56789",
      defaultCommissionType: "flat",
      defaultCommissionValue: 25,
    },
  });

  // ---------- CLIENT LOGIN (read-only) ----------
  const clientPassword = "Client123!";
  const clientUser = await prisma.user.create({
    data: {
      email: "amit@example.com",
      passwordHash: await bcrypt.hash(clientPassword, 10),
      role: "client",
      name: "Amit Patel",
      linkedClientId: client1.id,
    },
  });
  console.log(`✓ Client login: ${clientUser.email} / ${clientPassword}`);

  // ---------- SAMPLE TRANSACTIONS ----------
  // Amit Patel: buys RELIANCE and TCS, sells some RELIANCE (will realize a gain)
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  // BUY 100 RELIANCE @ 2400 (15 months ago — will be LTCG when sold)
  await prisma.transaction.create({
    data: {
      clientId: client1.id,
      symbol: "RELIANCE",
      exchange: "NSE",
      type: "buy",
      quantity: 100,
      pricePerShare: 2400,
      tradeDate: daysAgo(450),
      commissionAmount: 100 * 2400 * 0.005, // 0.5% = 1200
      createdByUserId: admin.id,
      notes: "Initial long-term position",
    },
  });

  // BUY 50 RELIANCE @ 2600 (3 months ago — STCG if sold)
  await prisma.transaction.create({
    data: {
      clientId: client1.id,
      symbol: "RELIANCE",
      exchange: "NSE",
      type: "buy",
      quantity: 50,
      pricePerShare: 2600,
      tradeDate: daysAgo(90),
      commissionAmount: 50 * 2600 * 0.005, // 650
      createdByUserId: admin.id,
    },
  });

  // SELL 80 RELIANCE @ 2850 (today) — FIFO matches against the LTCG lot
  await prisma.transaction.create({
    data: {
      clientId: client1.id,
      symbol: "RELIANCE",
      exchange: "NSE",
      type: "sell",
      quantity: 80,
      pricePerShare: 2850,
      tradeDate: daysAgo(2),
      commissionAmount: 80 * 2850 * 0.005, // 1140
      createdByUserId: admin.id,
      notes: "Partial exit — booking profit",
    },
  });

  // BUY 200 TCS @ 3500 (6 months ago)
  await prisma.transaction.create({
    data: {
      clientId: client1.id,
      symbol: "TCS",
      exchange: "NSE",
      type: "buy",
      quantity: 200,
      pricePerShare: 3500,
      tradeDate: daysAgo(180),
      commissionAmount: 200 * 3500 * 0.005, // 3500
      createdByUserId: admin.id,
    },
  });

  // Priya Singh: buys INFY and HDFC
  await prisma.transaction.create({
    data: {
      clientId: client2.id,
      symbol: "INFY",
      exchange: "NSE",
      type: "buy",
      quantity: 150,
      pricePerShare: 1450,
      tradeDate: daysAgo(200),
      commissionAmount: 25, // flat
      createdByUserId: admin.id,
    },
  });

  await prisma.transaction.create({
    data: {
      clientId: client2.id,
      symbol: "HDFCBANK",
      exchange: "NSE",
      type: "buy",
      quantity: 75,
      pricePerShare: 1620,
      tradeDate: daysAgo(60),
      commissionAmount: 25,
      createdByUserId: admin.id,
    },
  });

  // ---------- SAMPLE PAYMENTS ----------
  await prisma.payment.create({
    data: {
      clientId: client1.id,
      amount: 500000,
      direction: "in",
      status: "received",
      date: daysAgo(460),
      notes: "Initial capital deposit",
      createdByUserId: admin.id,
    },
  });

  await prisma.payment.create({
    data: {
      clientId: client1.id,
      amount: 228000,
      direction: "out",
      status: "received",
      date: daysAgo(1),
      notes: "Sell proceeds: 80 RELIANCE @ 2850",
      createdByUserId: admin.id,
    },
  });

  await prisma.payment.create({
    data: {
      clientId: client2.id,
      amount: 350000,
      direction: "in",
      status: "pending",
      date: daysAgo(5),
      notes: "Additional capital — pending bank confirmation",
      createdByUserId: admin.id,
    },
  });

  // ---------- CACHED PRICES (mock — real app fetches from Yahoo) ----------
  const prices = [
    { symbol: "RELIANCE", exchange: "NSE" as const, price: 2875 },
    { symbol: "TCS", exchange: "NSE" as const, price: 3680 },
    { symbol: "INFY", exchange: "NSE" as const, price: 1520 },
    { symbol: "HDFCBANK", exchange: "NSE" as const, price: 1695 },
  ];
  for (const p of prices) {
    await prisma.priceSnapshot.create({ data: p });
  }

  console.log("\n✅ Seed complete!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("LOGIN CREDENTIALS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Superadmin:  ${superadminEmail} / ${superadminPassword}`);
  console.log(`Admin:       rajesh@firm.com / ${adminPassword}`);
  console.log(`Client:      amit@example.com / ${clientPassword}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
