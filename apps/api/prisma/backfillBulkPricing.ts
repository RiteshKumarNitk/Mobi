/**
 * One-off backfill: adds bulk (box) pricing and GST HSN codes to products that
 * were created before those fields existed. Safe to re-run — it only updates
 * products missing a value.
 *
 * Run: npx tsx prisma/backfillBulkPricing.ts (from apps/api)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HSN: Record<string, string> = {
  "mobile-display": "8524",
  "lcd-display": "8524",
  "oled-display": "8524",
  battery: "8507",
  "original-battery": "8507",
  "compatible-battery": "8507",
  charger: "8504",
  "data-cable": "8544",
  "screen-guard": "3920",
  "back-panel": "7007",
  camera: "8525",
  audio: "8518",
  charging: "8504",
  accessories: "8517",
};

async function main() {
  const products = await prisma.product.findMany({
    include: { category: { select: { slug: true } } },
  });
  let updated = 0;
  for (const p of products) {
    const price = Number(p.price);
    const boxPrice = p.boxPrice != null ? p.boxPrice : Math.round((price * 0.88) / 5) * 5;
    const boxQuantity = p.boxQuantity ?? 10;
    const hsnCode = p.hsnCode ?? HSN[p.category?.slug ?? ""] ?? "8517";
    if (boxPrice !== p.boxPrice || boxQuantity !== p.boxQuantity || hsnCode !== p.hsnCode) {
      await prisma.product.update({
        where: { id: p.id },
        data: { boxPrice, boxQuantity, hsnCode },
      });
      updated++;
    }
  }
  console.log(`Backfilled ${updated}/${products.length} products with bulk pricing + HSN`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
