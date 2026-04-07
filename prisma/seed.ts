import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database (v0.2 position model)...");

  // Wipe
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.completedTrade.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  // Detach client login users before deleting clients
  await prisma.user.updateMany({
    where: { linkedClientId: { not: null } },
    data: { linkedClientId: null },
  });
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  // ---------- SUPERADMIN ----------
  const superadminEmail = process.env.SUPERADMIN_EMAIL || "admin@example.com";
  const superadminPassword = process.env.SUPERADMIN_PASSWORD || "ChangeMe123!";
  const superadmin = await prisma.user.create({
    data: {
      email: superadminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(superadminPassword, 10),
      role: "superadmin",
      name: "Super Admin",
    },
  });
  console.log(`✓ Superadmin: ${superadmin.email}`);

  // ---------- ADMIN ----------
  const admin = await prisma.user.create({
    data: {
      email: "rajesh@firm.com",
      passwordHash: await bcrypt.hash("Admin123!", 10),
      role: "admin",
      name: "Rajesh Sharma",
    },
  });
  console.log(`✓ Admin: ${admin.email}`);

  // ---------- CLIENTS ----------
  const amit = await prisma.client.create({
    data: {
      adminId: admin.id,
      name: "Amit Patel",
      email: "amit@example.com",
      phone: "+91-98765-43210",
      defaultCommissionType: "percentage",
      defaultCommissionValue: 0.5,
    },
  });

  const priya = await prisma.client.create({
    data: {
      adminId: admin.id,
      name: "Priya Singh",
      email: "priya@example.com",
      phone: "+91-91234-56789",
      defaultCommissionType: "flat",
      defaultCommissionValue: 25,
    },
  });

  // ---------- CLIENT LOGIN ----------
  await prisma.user.create({
    data: {
      email: "amit@example.com",
      passwordHash: await bcrypt.hash("Client123!", 10),
      role: "client",
      name: "Amit Patel",
      linkedClientId: amit.id,
    },
  });

  // ---------- BUY LOTS for Amit ----------
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86400000);

  // TCS — two lots at different prices (will show weighted avg in holdings)
  const tcsLot1 = await prisma.transaction.create({
    data: {
      clientId: amit.id,
      symbol: "TCS",
      exchange: "NSE",
      quantity: 100,
      remainingQty: 100,
      pricePerShare: 3500,
      tradeDate: daysAgo(180),
      createdByUserId: admin.id,
      notes: "Initial TCS position",
    },
  });

  const tcsLot2 = await prisma.transaction.create({
    data: {
      clientId: amit.id,
      symbol: "TCS",
      exchange: "NSE",
      quantity: 50,
      remainingQty: 50,
      pricePerShare: 3700,
      tradeDate: daysAgo(90),
      createdByUserId: admin.id,
      notes: "Added on dip",
    },
  });

  // RELIANCE — single lot
  await prisma.transaction.create({
    data: {
      clientId: amit.id,
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 80,
      remainingQty: 80,
      pricePerShare: 2550,
      tradeDate: daysAgo(120),
      createdByUserId: admin.id,
    },
  });

  // INFY — a lot that will be partially sold in the completed trade below
  const infyLot = await prisma.transaction.create({
    data: {
      clientId: amit.id,
      symbol: "INFY",
      exchange: "NSE",
      quantity: 200,
      remainingQty: 80, // 120 sold (see CompletedTrade below)
      pricePerShare: 1380,
      tradeDate: daysAgo(220),
      createdByUserId: admin.id,
    },
  });

  // ---------- COMPLETED TRADE for Amit ----------
  // 120 INFY sold at 1520, commission 0.5% of gross P&L (Interpretation A: signed)
  // grossPnL = 182,400 - 165,600 = 16,800
  // commissionAmount = 16,800 * 0.5% = 84
  // netPnL = 16,800 - 84 = 16,716
  {
    const sellQty = 120;
    const sellPrice = 1520;
    const totalBuyCost = 120 * 1380;
    const totalSellProceeds = sellQty * sellPrice;
    const grossPnL = totalSellProceeds - totalBuyCost;
    const commissionAmount = (grossPnL * 0.5) / 100;
    const netPnL = grossPnL - commissionAmount;
    const matchedLots = [
      {
        buyTransactionId: infyLot.id,
        buyDate: infyLot.tradeDate.toISOString(),
        buyPrice: 1380,
        qty: 120,
      },
    ];

    await prisma.completedTrade.create({
      data: {
        clientId: amit.id,
        symbol: "INFY",
        exchange: "NSE",
        sellDate: daysAgo(10),
        sellQty,
        sellPricePerShare: sellPrice,
        avgBuyPrice: 1380,
        totalBuyCost,
        totalSellProceeds,
        grossPnL,
        commissionType: "percentage",
        commissionValue: 0.5,
        commissionAmount,
        netPnL,
        matchedLotsJson: JSON.stringify(matchedLots),
        createdByUserId: admin.id,
        notes: "Partial exit",
      },
    });
  }

  // ---------- BUY LOTS for Priya ----------
  await prisma.transaction.create({
    data: {
      clientId: priya.id,
      symbol: "HDFCBANK",
      exchange: "NSE",
      quantity: 75,
      remainingQty: 75,
      pricePerShare: 1620,
      tradeDate: daysAgo(60),
      createdByUserId: admin.id,
    },
  });

  await prisma.transaction.create({
    data: {
      clientId: priya.id,
      symbol: "INFY",
      exchange: "NSE",
      quantity: 150,
      remainingQty: 150,
      pricePerShare: 1450,
      tradeDate: daysAgo(200),
      createdByUserId: admin.id,
    },
  });

  // ---------- PAYMENTS ----------
  await prisma.payment.create({
    data: {
      clientId: amit.id,
      amount: 500000,
      direction: "in",
      status: "received",
      date: daysAgo(230),
      notes: "Initial capital",
      createdByUserId: admin.id,
    },
  });

  await prisma.payment.create({
    data: {
      clientId: amit.id,
      amount: 181560,
      direction: "out",
      status: "received",
      date: daysAgo(9),
      notes: "INFY sell proceeds",
      createdByUserId: admin.id,
    },
  });

  await prisma.payment.create({
    data: {
      clientId: priya.id,
      amount: 350000,
      direction: "in",
      status: "pending",
      date: daysAgo(5),
      notes: "Additional capital pending",
      createdByUserId: admin.id,
    },
  });

  // ---------- CACHED PRICES ----------
  const prices = [
    { symbol: "TCS", exchange: "NSE" as const, price: 3680 },
    { symbol: "RELIANCE", exchange: "NSE" as const, price: 2875 },
    { symbol: "INFY", exchange: "NSE" as const, price: 1555 },
    { symbol: "HDFCBANK", exchange: "NSE" as const, price: 1695 },
  ];
  for (const p of prices) await prisma.priceSnapshot.create({ data: p });

  console.log("\n✅ Seed complete!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("LOGIN CREDENTIALS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Superadmin:  ${superadminEmail} / ${superadminPassword}`);
  console.log(`Admin:       rajesh@firm.com / Admin123!`);
  console.log(`Client:      amit@example.com / Client123!`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
