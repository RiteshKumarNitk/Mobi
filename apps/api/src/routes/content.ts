import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { NotFound } from "../lib/errors";
import { paginate } from "../lib/helpers";
import { validate } from "../middleware/validate";
import { rateLimit } from "../lib/rateLimit";
import { cached } from "../lib/cache";
import { getSettingsGroup } from "../lib/settings";
import { sanitizeRichText } from "../lib/sanitize";

export const contentRouter = Router();

export const activeBannersHandler = asyncH(async (_req: any, res: any) => {
  const banners = await cached("content:banners:active", 120, async () => {
    const now = new Date();
    const found = await prisma.banner.findMany({
      where: {
        status: "active",
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: { displayOrder: "asc" },
    });
    return found;
  }, res);
  res.json({ success: true, data: banners });
});

// GET /api/content/banners/active
contentRouter.get("/banners/active", activeBannersHandler);

// GET /api/pages/:slug
contentRouter.get(
  "/pages/:slug",
  asyncH(async (req, res) => {
    const page = await cached(`content:pages:${req.params.slug}`, 300, async () => {
      const found = await prisma.page.findUnique({ where: { slug: req.params.slug } });
      if (!found || found.status !== "published") throw NotFound("Page not found");
      return { ...found, content: sanitizeRichText(found.content) };
    }, res);
    res.json({ success: true, data: page });
  })
);

// GET /api/faqs
contentRouter.get(
  "/faqs",
  asyncH(async (req, res) => {
    const { category, q } = req.query;
    const where: any = { status: "active" };
    if (category) where.category = String(category);
    if (q) where.question = { contains: String(q).slice(0, 100), mode: "insensitive" };
    const faqs = await prisma.faq.findMany({ where, orderBy: { displayOrder: "asc" } });
    res.json({ success: true, data: faqs });
  })
);

// GET /api/faqs/categories
contentRouter.get(
  "/faqs/categories",
  asyncH(async (_req, res) => {
    const faqs = await prisma.faq.findMany({ where: { status: "active" }, select: { category: true } });
    const categories = [...new Set(faqs.map((f) => f.category).filter(Boolean))];
    res.json({ success: true, data: categories });
  })
);

// GET /api/blog
contentRouter.get(
  "/blog",
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { category, q } = req.query;
    const where: any = { status: "published" };
    if (category) where.category = String(category);
    if (q) where.OR = [{ title: { contains: String(q).slice(0, 100), mode: "insensitive" } }, { excerpt: { contains: String(q).slice(0, 100), mode: "insensitive" } }];
    const [total, items] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({ where, orderBy: { publishedAt: "desc" }, skip, take }),
    ]);
    res.json({ success: true, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  })
);

// GET /api/blog/categories (declared before /blog/:slug, which would otherwise capture it)
contentRouter.get(
  "/blog/categories",
  asyncH(async (_req, res) => {
    const posts = await prisma.blogPost.findMany({ where: { status: "published" }, select: { category: true } });
    const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))];
    res.json({ success: true, data: categories });
  })
);

// GET /api/blog/:slug
contentRouter.get(
  "/blog/:slug",
  asyncH(async (req, res) => {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
    if (!post || post.status !== "published") throw NotFound("Blog post not found");
    await prisma.blogPost.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
    res.json({ success: true, data: { ...post, content: sanitizeRichText(post.content) } });
  })
);

// POST /api/newsletter/subscribe
contentRouter.post(
  "/newsletter/subscribe",
  validate(z.object({ email: z.string().email().max(200).transform((e) => e.toLowerCase()) })),
  rateLimit({ max: 10 }),
  asyncH(async (req, res) => {
    await prisma.newsletterSubscriber.upsert({
      where: { email: req.body.email },
      update: {},
      create: { email: req.body.email },
    });
    res.json({ success: true, data: { message: "Subscribed successfully" } });
  })
);

// POST /api/contact
contentRouter.post(
  "/contact",
  validate(z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(200), phone: z.string().max(20).optional(), subject: z.string().max(200).optional(), message: z.string().trim().min(5).max(5000) })),
  rateLimit({ max: 10 }),
  asyncH(async (req, res) => {
    await prisma.contactMessage.create({ data: req.body });
    res.json({ success: true, data: { message: "Message sent. We will get back to you shortly." } });
  })
);

// GET /api/company-info
contentRouter.get(
  "/company-info",
  asyncH(async (_req, res) => {
    const general = await getSettingsGroup("general");
    res.json({
      success: true,
      data: {
        name: general.company_name ?? "Baba Communication",
        address: general.company_address ?? "",
        phone: general.company_phone ?? "",
        email: general.company_email ?? "",
        gst: general.gst_number ?? "",
        businessHours: general.business_hours ?? "",
      },
    });
  })
);
