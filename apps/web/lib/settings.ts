import { prisma } from "./prisma";

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getSettingsGroup(group: string): Promise<Record<string, string>> {
  const rows = await prisma.systemSetting.findMany({ where: { groupKey: group } });
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value ?? "";
  return out;
}

export async function setSetting(group: string, key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value, groupKey: group },
    create: { key, value, groupKey: group },
  });
}

/** Flat shipping charge, free when above threshold (both from "shipping" group). */
export async function shippingChargeFor(subtotal: number): Promise<number> {
  const [flatRaw, thresholdRaw] = await Promise.all([
    getSetting("shipping_flat_rate"),
    getSetting("shipping_free_threshold"),
  ]);
  const flat = Number(flatRaw ?? "0");
  const threshold = Number(thresholdRaw ?? "0");
  if (threshold > 0 && subtotal >= threshold) return 0;
  return flat;
}

/** Low-stock alert threshold (from "general" group, default 10). */
export async function lowStockThreshold(): Promise<number> {
  const raw = await getSetting("low_stock_threshold");
  return Number(raw ?? "10");
}
