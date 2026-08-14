export const inr = (n: number | string | null | undefined) =>
  n == null || n === "" ? "₹0" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const discountPct = (price: number | string, mrp: number | string | null | undefined) =>
  mrp && Number(mrp) > Number(price) ? Math.round((1 - Number(price) / Number(mrp)) * 100) : null;

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
