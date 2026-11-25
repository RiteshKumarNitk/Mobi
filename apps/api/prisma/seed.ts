/**
 * Seed script - creates a full demo dataset:
 * - Admin (9999999999 / Admin@123) and customer (8888888888 / Customer@123)
 * - Categories, brands, ~60 products, banners, coupons, pages, FAQs, blog
 * - Reviews, notifications and two demo orders
 *
 * Run with: npm run db:seed (from repo root) or npm run db:seed -w @baba/api
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertNonProductionDb } from "../scripts/guard-destructive";

// Demo accounts with published passwords must never be planted in a live database.
assertNonProductionDb("seed demo data (known admin/customer passwords)");

const prisma = new PrismaClient();

// Demo photos: free CC0 / public-domain stock images served by the storefront
// from apps/web/public/images/catalog (credits in CREDITS.md there).
const photo = (name: string) => `/images/catalog/${name}.jpg`;
const CATEGORY_PHOTO: Record<string, string> = {
  "mobile-display": "display", "lcd-display": "display", "oled-display": "oled",
  "battery": "battery", "original-battery": "battery", "compatible-battery": "battery-alt",
  "charging": "charger", "charger": "charger", "data-cable": "cable",
  "screen-guard": "screen-guard", "back-panel": "back-panel", "camera": "camera",
  "audio": "audio", "accessories": "accessories",
};
const ALT_PHOTO: Record<string, string> = {
  "display": "display-alt", "oled": "display-alt", "battery": "battery-alt", "battery-alt": "battery",
  "charger": "charger-alt", "cable": "cable-alt", "screen-guard": "screen-guard-alt",
  "back-panel": "back-panel-alt", "camera": "camera-alt", "audio": "audio-alt", "accessories": "accessories-alt",
};
const categoryPhoto = (slug: string) => photo(CATEGORY_PHOTO[slug] ?? "accessories");
const productPhotos = (catSlug: string) => {
  const main = CATEGORY_PHOTO[catSlug] ?? "accessories";
  return [
    { url: photo(main), isPrimary: true, displayOrder: 0 },
    { url: photo(ALT_PHOTO[main] ?? main), isPrimary: false, displayOrder: 1 },
  ];
};
/** Seed-generated placeholder (older seeds); safe to replace. Admin-uploaded images are never touched. */
const isPlaceholder = (url?: string | null) => !url || url.includes("placehold.co");

async function main() {
  console.log("Seeding Baba Communication platform...");

  // ---- System settings ----
  const settings: [string, string, string][] = [
    ["general", "company_name", "Baba Communication"],
    ["general", "company_address", "Shop 12, Electronic Market, Sector 18, Noida, Uttar Pradesh 201301"],
    ["general", "company_phone", "+91 98765 43210"],
    ["general", "company_email", "sales@babacommunication.com"],
    ["general", "gst_number", "07AABCB1234F1Z5"],
    ["general", "business_hours", "Mon-Sat 10:00 AM - 7:00 PM"],
    ["general", "low_stock_threshold", "10"],
    ["shipping", "shipping_flat_rate", "0"],
    ["shipping", "shipping_free_threshold", "0"],
    ["payment", "cod_enabled", "true"],
    ["payment", "razorpay_enabled", "true"],
    ["payment", "currency", "INR"],
  ];
  for (const [group, key, value] of settings) {
    await prisma.systemSetting.upsert({ where: { key }, update: { value, groupKey: group }, create: { key, value, groupKey: group } });
  }

  // ---- Roles ----
  const roles: [string, string, string[]][] = [
    ["super_admin", "Full access to everything", ["*"]],
    ["admin", "All except system settings", ["products.view", "products.edit", "orders.view", "orders.update", "customers.view", "inventory.view", "inventory.update", "reports.view", "marketing.edit", "content.edit"]],
    ["manager", "Orders and inventory", ["orders.view", "orders.update", "inventory.view", "inventory.update", "customers.view", "products.view", "reports.view"]],
    ["staff", "View-only access", ["products.view", "orders.view", "inventory.view", "customers.view"]],
  ];
  for (const [name, description, permissions] of roles) {
    await prisma.roleGroup.upsert({ where: { name }, update: {}, create: { name, description, permissions } });
  }

  // ---- Users ----
  const adminHash = await bcrypt.hash("Admin@123", 10);
  const admin = await prisma.user.upsert({
    where: { phone: "9999999999" },
    update: {},
    create: {
      phone: "9999999999",
      email: "admin@babacommunication.com",
      passwordHash: adminHash,
      firstName: "Baba",
      lastName: "Admin",
      role: "super_admin",
      phoneVerified: true,
      settings: { create: {} },
    },
  });
  console.log("  Admin:", admin.phone, "/ Admin@123");

  const custHash = await bcrypt.hash("Customer@123", 10);
  const customer = await prisma.user.upsert({
    where: { phone: "8888888888" },
    update: {},
    create: {
      phone: "8888888888",
      email: "customer@example.com",
      passwordHash: custHash,
      firstName: "Rahul",
      lastName: "Sharma",
      shopName: "Rahul Mobile Point",
      gstNumber: "09ABCDE1234F1Z8",
      phoneVerified: true,
      settings: { create: {} },
    },
  });
  console.log("  Customer:", customer.phone, "/ Customer@123");

  await prisma.userAddress.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      userId: customer.id,
      fullName: "Rahul Sharma",
      phone: "8888888888",
      addressLine1: "Shop 4, Nehru Market",
      addressLine2: "Near Bus Stand",
      city: "Noida",
      state: "Uttar Pradesh",
      pincode: "201301",
      addressType: "Shop",
      isDefault: true,
    },
  });

  // ---- Categories ----
  const categoryDefs: [string, string, string | null, string][] = [
    ["Mobile Display", "mobile-display", null, "Replacement LCD and OLED displays for all major phone brands"],
    ["LCD Display", "lcd-display", "mobile-display", "LCD replacement screens"],
    ["OLED Display", "oled-display", "mobile-display", "OLED and AMOLED panels"],
    ["Battery", "battery", null, "Replacement phone batteries - original and compatible"],
    ["Original Battery", "original-battery", "battery", "Genuine brand batteries"],
    ["Compatible Battery", "compatible-battery", "battery", "High-quality compatible batteries"],
    ["Charging", "charging", null, "Chargers, adapters and cables"],
    ["Charger", "charger", "charging", "Wall and fast chargers"],
    ["Data Cable", "data-cable", "charging", "USB and Type-C cables"],
    ["Screen Guard", "screen-guard", null, "Tempered glass and film screen guards"],
    ["Back Panel", "back-panel", null, "Replacement back covers and panels"],
    ["Camera", "camera", null, "Rear and front camera modules"],
    ["Audio", "audio", null, "Speakers, earpieces and microphones"],
    ["Accessories", "accessories", null, "Sim trays, charging ports and other small parts"],
  ];
  const categoryIds: Record<string, string> = {};
  for (const [name, slug, parentSlug, description] of categoryDefs) {
    const parent = parentSlug ? await prisma.category.findUnique({ where: { slug: parentSlug } }) : null;
    const cat = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug, description, parentId: parent?.id ?? null, imageUrl: categoryPhoto(slug) },
    });
    if (isPlaceholder(cat.imageUrl)) await prisma.category.update({ where: { id: cat.id }, data: { imageUrl: categoryPhoto(slug) } });
    categoryIds[slug] = cat.id;
  }

  // ---- Brands ----
  const brandDefs: string[] = ["Samsung", "Apple", "Xiaomi", "Vivo", "Oppo", "Realme", "OnePlus", "Motorola", "Nokia", "Infinix"];
  const brandIds: Record<string, string> = {};
  for (const [i, name] of brandDefs.entries()) {
    const brand = await prisma.brand.upsert({
      where: { slug: name.toLowerCase() },
      update: {},
      create: { name, slug: name.toLowerCase(), description: `${name} spare parts and accessories`, displayOrder: i },
    });
    brandIds[name] = brand.id;
  }

  // ---- Products ----
  type ProductDef = {
    name: string; cat: string; brand: string; price: number; stock: number;
    feat?: boolean; isNew?: boolean; best?: boolean; attrs?: [string, string][];
  };
  const productDefs: ProductDef[] = [
    { name: "Samsung Galaxy S23 LCD Display", cat: "lcd-display", brand: "Samsung", price: 1450, stock: 24, feat: true, best: true, attrs: [["Type", "Super AMOLED"], ["Size", "6.1 inch"], ["Condition", "New"], ["Warranty", "6 months"]] },
    { name: "Samsung Galaxy S23 Ultra OLED Display", cat: "oled-display", brand: "Samsung", price: 7800, stock: 8, feat: true, attrs: [["Type", "Dynamic AMOLED 2X"], ["Size", "6.8 inch"], ["Condition", "New"], ["Warranty", "6 months"]] },
    { name: "iPhone 14 LCD Display", cat: "lcd-display", brand: "Apple", price: 5200, stock: 15, feat: true, attrs: [["Type", "Super Retina XDR"], ["Size", "6.1 inch"], ["Condition", "New"]] },
    { name: "iPhone 13 OLED Display", cat: "oled-display", brand: "Apple", price: 6400, stock: 5, attrs: [["Type", "Super Retina XDR"], ["Size", "6.1 inch"]] },
    { name: "Xiaomi Redmi Note 12 LCD Display", cat: "lcd-display", brand: "Xiaomi", price: 1050, stock: 30, feat: true, best: true, attrs: [["Type", "AMOLED"], ["Size", "6.67 inch"]] },
    { name: "Xiaomi Redmi 10 LCD Display", cat: "lcd-display", brand: "Xiaomi", price: 850, stock: 0, attrs: [["Type", "IPS LCD"], ["Size", "6.5 inch"]] },
    { name: "Vivo V23 5G OLED Display", cat: "oled-display", brand: "Vivo", price: 2350, stock: 12, attrs: [["Type", "AMOLED"], ["Size", "6.44 inch"]] },
    { name: "Oppo F21 Pro OLED Display", cat: "oled-display", brand: "Oppo", price: 2900, stock: 9, attrs: [["Type", "AMOLED"], ["Size", "6.43 inch"]] },
    { name: "Realme 9 Pro LCD Display", cat: "lcd-display", brand: "Realme", price: 1150, stock: 18, attrs: [["Type", "IPS LCD"], ["Size", "6.6 inch"]] },
    { name: "OnePlus Nord CE 2 OLED Display", cat: "oled-display", brand: "OnePlus", price: 3100, stock: 7, attrs: [["Type", "AMOLED"], ["Size", "6.43 inch"]] },
    { name: "Samsung Galaxy M13 Battery", cat: "original-battery", brand: "Samsung", price: 480, stock: 40, feat: true, best: true, attrs: [["Capacity", "5000 mAh"], ["Type", "Li-Polymer"], ["Warranty", "6 months"]] },
    { name: "iPhone 12 Battery", cat: "original-battery", brand: "Apple", price: 1250, stock: 20, attrs: [["Capacity", "2815 mAh"], ["Type", "Li-Ion"]] },
    { name: "Xiaomi Redmi Note 11 Battery", cat: "compatible-battery", brand: "Xiaomi", price: 390, stock: 55, feat: true, attrs: [["Capacity", "5000 mAh"], ["Type", "Li-Polymer"]] },
    { name: "Vivo Y21 Battery", cat: "compatible-battery", brand: "Vivo", price: 340, stock: 32, attrs: [["Capacity", "5000 mAh"]] },
    { name: "Oppo A54 Battery", cat: "compatible-battery", brand: "Oppo", price: 360, stock: 28, attrs: [["Capacity", "5000 mAh"]] },
    { name: "Realme C25 Battery", cat: "compatible-battery", brand: "Realme", price: 350, stock: 0, attrs: [["Capacity", "6000 mAh"]] },
    { name: "Samsung 25W Super Fast Charger", cat: "charger", brand: "Samsung", price: 650, stock: 60, feat: true, best: true, attrs: [["Output", "25W USB-C"], ["Type", "Wall charger"]] },
    { name: "Apple 20W USB-C Power Adapter", cat: "charger", brand: "Apple", price: 1400, stock: 25, attrs: [["Output", "20W USB-C"], ["Type", "Wall charger"]] },
    { name: "Xiaomi 33W Fast Charger", cat: "charger", brand: "Xiaomi", price: 420, stock: 45, attrs: [["Output", "33W USB-C"]] },
    { name: "OnePlus 65W Warp Charger", cat: "charger", brand: "OnePlus", price: 950, stock: 22, attrs: [["Output", "65W USB-C"]] },
    { name: "Type-C Fast Charging Cable 1m", cat: "data-cable", brand: "Samsung", price: 120, stock: 200, feat: true, attrs: [["Length", "1 meter"], ["Type", "USB-C to USB-A"]] },
    { name: "iPhone Lightning Cable 1m", cat: "data-cable", brand: "Apple", price: 350, stock: 80, attrs: [["Length", "1 meter"]] },
    { name: "Samsung Galaxy S22 Tempered Glass", cat: "screen-guard", brand: "Samsung", price: 110, stock: 120, feat: true, attrs: [["Type", "Tempered glass"], ["Thickness", "0.33mm"]] },
    { name: "iPhone 14 Tempered Glass", cat: "screen-guard", brand: "Apple", price: 150, stock: 90, attrs: [["Type", "Tempered glass"]] },
    { name: "Xiaomi Redmi Note 12 Tempered Glass", cat: "screen-guard", brand: "Xiaomi", price: 90, stock: 150, attrs: [["Type", "Tempered glass"]] },
    { name: "Samsung Galaxy A53 Back Panel", cat: "back-panel", brand: "Samsung", price: 550, stock: 30, attrs: [["Color", "Black"], ["Material", "Glass"]] },
    { name: "iPhone 13 Back Glass", cat: "back-panel", brand: "Apple", price: 850, stock: 14, attrs: [["Color", "Black"], ["Material", "Glass"]] },
    { name: "Xiaomi Redmi Note 11 Back Cover", cat: "back-panel", brand: "Xiaomi", price: 320, stock: 35, attrs: [["Color", "Multiple"]] },
    { name: "Samsung Galaxy S21 Rear Camera Module", cat: "camera", brand: "Samsung", price: 1850, stock: 10, feat: true, attrs: [["Megapixels", "64MP"], ["Condition", "New"]] },
    { name: "iPhone 12 Rear Camera", cat: "camera", brand: "Apple", price: 3400, stock: 6, attrs: [["Megapixels", "12MP"]] },
    { name: "Xiaomi Redmi Note 11 Rear Camera", cat: "camera", brand: "Xiaomi", price: 720, stock: 18, attrs: [["Megapixels", "50MP"]] },
    { name: "Samsung Galaxy M31 Speaker", cat: "audio", brand: "Samsung", price: 210, stock: 40, attrs: [["Type", "Main speaker"]] },
    { name: "iPhone 13 Loudspeaker", cat: "audio", brand: "Apple", price: 580, stock: 12, attrs: [["Type", "Loudspeaker"]] },
    { name: "Xiaomi Redmi 9 Earpiece", cat: "audio", brand: "Xiaomi", price: 95, stock: 70, attrs: [["Type", "Earpiece"]] },
    { name: "Samsung SIM Tray Galaxy A52", cat: "accessories", brand: "Samsung", price: 85, stock: 100, attrs: [["Type", "SIM tray"]] },
    { name: "iPhone 13 SIM Tray", cat: "accessories", brand: "Apple", price: 190, stock: 60, attrs: [["Type", "SIM tray"]] },
    { name: "Type-C Charging Port Redmi Note 12", cat: "accessories", brand: "Xiaomi", price: 260, stock: 45, attrs: [["Type", "Charging port"]] },
    { name: "Vivo Y33s LCD Display", cat: "lcd-display", brand: "Vivo", price: 1250, stock: 16, attrs: [["Type", "IPS LCD"], ["Size", "6.58 inch"]] },
    { name: "Oppo A74 LCD Display", cat: "lcd-display", brand: "Oppo", price: 1150, stock: 14, attrs: [["Type", "IPS LCD"], ["Size", "6.43 inch"]] },
    { name: "Realme Narzo 50 LCD Display", cat: "lcd-display", brand: "Realme", price: 1080, stock: 0, attrs: [["Type", "IPS LCD"], ["Size", "6.6 inch"]] },
    { name: "OnePlus 9 Pro OLED Display", cat: "oled-display", brand: "OnePlus", price: 6900, stock: 4, attrs: [["Type", "LTPO AMOLED"], ["Size", "6.7 inch"]] },
    { name: "Motorola G62 LCD Display", cat: "lcd-display", brand: "Motorola", price: 1350, stock: 11, attrs: [["Type", "IPS LCD"], ["Size", "6.5 inch"]] },
    { name: "Nokia G21 Battery", cat: "compatible-battery", brand: "Nokia", price: 430, stock: 26, attrs: [["Capacity", "5050 mAh"]] },
    { name: "Infinix Hot 12 LCD Display", cat: "lcd-display", brand: "Infinix", price: 980, stock: 19, attrs: [["Type", "IPS LCD"], ["Size", "6.6 inch"]] },
  ];

  const HSN: Record<string, string> = {
    "mobile-display": "8524", "lcd-display": "8524", "oled-display": "8524",
    "battery": "8507", "original-battery": "8507", "compatible-battery": "8507",
    "charger": "8504", "data-cable": "8544", "screen-guard": "3920",
    "back-panel": "7007", "camera": "8525", "audio": "8518",
    "charging": "8504", "accessories": "8517",
  };

  let featured = 0;
  let newArrival = 0;
  for (const def of productDefs) {
    const mrp = Math.round(def.price * 1.35);
    const isNew = def.isNew ?? (newArrival++ < 6);
    const isFeatured = def.feat ?? (featured++ < 10);
    const boxPrice = Math.round((def.price * 0.88) / 5) * 5;
    // Idempotent: products are matched by name (SKUs of earlier seeds were random),
    // and new SKUs/slugs are deterministic so re-running never duplicates the catalogue.
    const existing = await prisma.product.findFirst({ where: { name: def.name }, orderBy: { createdAt: "asc" } });
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data: { boxPrice, boxQuantity: 10, hsnCode: HSN[def.cat] ?? "8517" } });
      // Swap old placeholder pictures for the demo photos, only if every image is a placeholder.
      const images = await prisma.productImage.findMany({ where: { productId: existing.id }, select: { url: true } });
      if (images.every((im) => isPlaceholder(im.url))) {
        await prisma.productImage.deleteMany({ where: { productId: existing.id } });
        await prisma.productImage.createMany({ data: productPhotos(def.cat).map((im) => ({ ...im, productId: existing.id })) });
      }
      continue;
    }
    const nameKey = [...def.name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 900, 7) + 100;
    const sku = `SKU-${def.brand.toUpperCase().slice(0, 3)}-${String(def.price).padStart(4, "0")}-${nameKey}`;
    await prisma.product.upsert({
      where: { sku },
      update: { boxPrice, boxQuantity: 10, hsnCode: HSN[def.cat] ?? "8517" },
      create: {
        name: def.name,
        sku,
        slug: `${def.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${nameKey}`,
        categoryId: categoryIds[def.cat],
        brandId: brandIds[def.brand],
        price: def.price,
        mrp,
        costPrice: Math.round(def.price * 0.8),
        boxPrice,
        boxQuantity: 10,
        hsnCode: HSN[def.cat] ?? "8517",
        stockQuantity: def.stock,
        stockStatus: def.stock > 10 ? "in_stock" : def.stock > 0 ? "low_stock" : "out_of_stock",
        isFeatured,
        isNew,
        isBestSeller: def.best ?? false,
        description: `${def.name}. High-quality replacement part for ${def.brand} smartphones. Compatible with the original and easy to install. Each unit is quality tested before dispatch.`,
        shortDescription: `Replacement ${def.cat.replace("-", " ")} for ${def.brand} phones.`,
        attributes: { create: (def.attrs ?? []).map(([name, value], i) => ({ name, value, displayOrder: i })) },
        images: { create: productPhotos(def.cat) },
        tags: { connectOrCreate: [{ where: { name: def.brand.toLowerCase() }, create: { name: def.brand.toLowerCase() } }] },
      },
    });
  }
  console.log(`  Products: ${productDefs.length}`);

  // ---- Banners ----
  const banners: [string, string, string, string, string][] = [
    ["B2B Pricing on 10,000+ Spare Parts", "Bulk rates for repair shops & retailers", "homepage", photo("banner-parts"), "/products"],
    ["New OLED Displays Arrived", "Samsung, Apple, Xiaomi - all models", "homepage", photo("banner-display"), "/categories/oled-display"],
    ["Genuine Batteries In Stock", "Original & compatible - 6 month warranty", "homepage", photo("banner-battery"), "/categories/battery"],
    ["Flat 10% Off First Order", "Use code WELCOME10", "offers", photo("banner-offer"), "/offers"],
    ["Bulk Order Special", "Extra 5% off orders above ₹10,000 with BULK500", "offers", photo("banner-bulk"), "/offers"],
  ];
  // Idempotent: banners are matched by title, so re-running never duplicates them.
  for (const [title, subtitle, type, imageUrl, linkUrl] of banners) {
    const found = await prisma.banner.findMany({ where: { title }, orderBy: { createdAt: "asc" } });
    if (!found.length) {
      await prisma.banner.create({ data: { title, subtitle, type: type as any, imageUrl, linkUrl, displayOrder: 0, status: "active" } });
      continue;
    }
    const [keep, ...duplicates] = found;
    // Remove copies left by older (non-idempotent) seed runs.
    if (duplicates.length) await prisma.banner.deleteMany({ where: { id: { in: duplicates.map((b) => b.id) } } });
    if (isPlaceholder(keep.imageUrl)) await prisma.banner.update({ where: { id: keep.id }, data: { imageUrl } });
  }

  // ---- Coupons ----
  const now = new Date();
  const couponDefs: [string, "percentage" | "fixed", number, number, number | null, number, string][] = [
    ["WELCOME10", "percentage", 10, 500, 500, 1, "10% off on your first order above ₹500"],
    ["FLAT200", "fixed", 200, 2000, null, 1, "₹200 off on orders above ₹2,000"],
    ["BULK500", "percentage", 5, 10000, 1500, 5, "5% off for bulk orders above ₹10,000"],
  ];
  for (const [code, type, value, min, maxDisc, perUser, description] of couponDefs) {
    await prisma.coupon.upsert({
      where: { code },
      // Re-seeding refreshes the validity window so demo coupons never sit expired.
      update: {
        status: "active",
        startDate: new Date(now.getTime() - 24 * 3600 * 1000),
        endDate: new Date(now.getTime() + 90 * 24 * 3600 * 1000),
      },
      create: {
        code, type, value, minOrderAmount: min, maxDiscountAmount: maxDisc, perUserLimit: perUser,
        description, status: "active",
        startDate: new Date(now.getTime() - 24 * 3600 * 1000),
        endDate: new Date(now.getTime() + 90 * 24 * 3600 * 1000),
      },
    });
  }

  // ---- Pages ----
  const pages: [string, string, string][] = [
    ["about", "About Us", "<h2>About Baba Communication</h2><p>Baba Communication is a trusted wholesale supplier of mobile spare parts serving repair shops and retailers across India for over 15 years.</p>"],
    ["privacy", "Privacy Policy", "<h2>Privacy Policy</h2><p>We collect only the information needed to process your orders and never sell your data to third parties.</p>"],
    ["terms", "Terms & Conditions", "<h2>Terms & Conditions</h2><p>By using this platform you agree to our terms. Prices are B2B and subject to change without notice.</p>"],
    ["shipping-policy", "Shipping Policy", "<h2>Shipping Policy</h2><p>Orders are dispatched within 24 hours on business days. Delivery typically takes 2-5 days across India.</p>"],
    ["return-policy", "Return Policy", "<h2>Return Policy</h2><p>Defective or damaged parts can be returned within 7 days of delivery. Returns are processed after quality inspection.</p>"],
    ["cancellation-policy", "Cancellation Policy", "<h2>Cancellation Policy</h2><p>Orders can be cancelled before dispatch. Once shipped, cancellation is not possible.</p>"],
  ];
  for (const [slug, title, content] of pages) {
    await prisma.page.upsert({
      where: { slug },
      update: {},
      create: { slug, title, content, status: "published", metaTitle: `${title} - Baba Communication` },
    });
  }

  // ---- FAQs ----
  const faqs: [string, string, string][] = [
    ["Orders", "What is the minimum order quantity?", "There is no minimum order quantity. You can order even a single part."],
    ["Orders", "Do you offer wholesale rates?", "Yes. Register as a B2B customer and you get special wholesale pricing on bulk orders."],
    ["Shipping", "How long does delivery take?", "Orders are dispatched within 24 hours and typically delivered in 2-5 days across India."],
    ["Shipping", "Do you ship outside India?", "Currently we ship across India only."],
    ["Payments", "What payment methods do you accept?", "We accept UPI, credit/debit cards, net banking via Razorpay, and Cash on Delivery."],
    ["Payments", "Is Cash on Delivery available?", "Yes, COD is available on eligible orders."],
    ["Returns", "What if I receive a defective part?", "Raise a return request within 7 days of delivery. We inspect and replace or refund."],
    ["Returns", "How do I track my return?", "You can see the return status in your account under Orders > Returns."],
    ["Account", "How do I register as a wholesale buyer?", "Create an account with your shop details and GST number. Our team will verify and activate wholesale pricing."],
  ];
  for (const [category, question, answer] of faqs) {
    await prisma.faq.create({ data: { category, question, answer, status: "active" } });
  }

  // ---- Blog ----
  const blogPosts: [string, string, string, string, string][] = [
    ["How to Choose the Right Mobile Display", "display-repair-guide", "Display-repair", "Choosing between LCD, OLED and AMOLED displays for your customers.", "blog-display"],
    ["5 Signs a Phone Battery Needs Replacement", "battery-replacement-signs", "Maintenance", "Know when to recommend a battery replacement to your customers.", "blog-battery"],
    ["Wholesale Buying Guide for Repair Shops", "wholesale-buying-guide", "Business", "How to stock your repair shop efficiently and maximise margins.", "blog-wholesale"],
  ];
  for (const [title, slug, category, excerpt, image] of blogPosts) {
    const post = await prisma.blogPost.upsert({
      where: { slug },
      update: {},
      create: {
        title, slug, category, excerpt,
        content: `<p>${excerpt}</p><p>At Baba Communication we help repair shops across India source genuine mobile spare parts at wholesale prices.</p>`,
        featuredImage: photo(image),
        status: "published",
        publishedAt: new Date(now.getTime() - Math.floor(Math.random() * 30) * 24 * 3600 * 1000),
      },
    });
    if (isPlaceholder(post.featuredImage)) await prisma.blogPost.update({ where: { id: post.id }, data: { featuredImage: photo(image) } });
  }

  // ---- Reviews ----
  const products = await prisma.product.findMany({ where: { isFeatured: true }, take: 3 });
  for (const [i, product] of products.entries()) {
    await prisma.review.upsert({
      where: { id: `00000000-0000-4000-8000-00000000000${i + 2}` },
      update: {},
      create: {
        id: `00000000-0000-4000-8000-00000000000${i + 2}`,
        productId: product.id,
        userId: customer.id,
        rating: 5,
        title: "Great quality part",
        comment: "Perfect fit and works flawlessly. My customers are happy with the repairs.",
        status: "approved",
        helpfulCount: 3,
      },
    });
  }

  // ---- Demo orders ----
  const orderedProducts = await prisma.product.findMany({ where: { isBestSeller: true }, take: 2 });
  const address = await prisma.userAddress.findFirst({ where: { userId: customer.id } });

  const demoOrder1 = await prisma.order.findUnique({ where: { orderNumber: "BC-DEMO0001" } });
  if (!demoOrder1 && orderedProducts.length === 2 && address) {
    const subtotal = orderedProducts.reduce((s, p) => s + Number(p.price), 0);
    const order = await prisma.order.create({
      data: {
        orderNumber: "BC-DEMO0001",
        userId: customer.id,
        status: "delivered",
        paymentStatus: "paid",
        paymentMethod: "razorpay",
        shippingAddressId: address.id,
        billingAddressId: address.id,
        subtotal,
        totalAmount: subtotal,
        shippingMethod: "standard",
        deliveredAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
        createdAt: new Date(now.getTime() - 6 * 24 * 3600 * 1000),
        items: {
          create: orderedProducts.map((p, i) => ({
            productId: p.id, productName: p.name, productSku: p.sku,
            quantity: 2, price: p.price, total: Number(p.price) * 2,
          })),
        },
        statusHistory: {
          create: [
            { status: "pending", notes: "Order placed", createdAt: new Date(now.getTime() - 6 * 24 * 3600 * 1000) },
            { status: "processing", notes: "Verified", createdAt: new Date(now.getTime() - 5 * 24 * 3600 * 1000) },
            { status: "packed", notes: "Packed", createdAt: new Date(now.getTime() - 5 * 24 * 3600 * 1000 + 3600 * 1000) },
            { status: "shipped", notes: "Handed to courier", createdAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000) },
            { status: "delivered", notes: "Delivered", createdAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000) },
          ],
        },
        payments: { create: { gatewayPaymentId: "pay_demo_001", paymentMethod: "razorpay", amount: subtotal, status: "paid", completedAt: new Date(now.getTime() - 6 * 24 * 3600 * 1000) } },
      },
    });

    const demoOrder2 = await prisma.order.findUnique({ where: { orderNumber: "BC-DEMO0002" } });
    if (!demoOrder2) {
      await prisma.order.create({
        data: {
          orderNumber: "BC-DEMO0002",
          userId: customer.id,
          status: "processing",
          paymentStatus: "pending",
          paymentMethod: "cod",
          shippingAddressId: address.id,
          billingAddressId: address.id,
          subtotal: 1450,
          totalAmount: 1450,
          shippingMethod: "standard",
          createdAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
          items: { create: [{ productName: "Samsung Galaxy S23 LCD Display", productSku: "SKU-DEMO-1", quantity: 1, price: 1450, total: 1450 }] },
          statusHistory: {
            create: [
              { status: "pending", notes: "Order placed", createdAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000) },
              { status: "processing", notes: "Processing", createdAt: new Date(now.getTime() - 12 * 3600 * 1000) },
            ],
          },
          payments: { create: { gatewayPaymentId: "pay_demo_002", paymentMethod: "cod", amount: 1450, status: "pending" } },
        },
      });
    }

    await prisma.notification.create({
      data: {
        userId: customer.id,
        type: "order",
        title: "Order delivered",
        message: `Your order ${order.orderNumber} has been delivered. Happy repairing!`,
      },
    });
  }

  // ---- Notifications ----
  await prisma.notification.create({
    data: {
      userId: customer.id,
      type: "promo",
      title: "Welcome to Baba Communication",
      message: "Use code WELCOME10 for 10% off your first order.",
    },
  });

  console.log("Seed complete ✔");
  console.log("  Admin login:    9999999999 / Admin@123");
  console.log("  Customer login: 8888888888 / Customer@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
