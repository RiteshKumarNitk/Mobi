import { type ApiRequest, type ApiResponse, defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { NotFound } from "../lib/errors";
import { paginate } from "../lib/helpers";
import { validate } from "../lib/validate";
import { rateLimit } from "../lib/rateLimit";
import { cached } from "../lib/cache";
import { getSettingsGroup } from "../lib/settings";
import { sanitizeRichText } from "../lib/sanitize";

const activeBannersHandler = async (_req: ApiRequest, res: ApiResponse) => {
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
  return res.json({ success: true, data: banners });
};

// GET /api/content/banners/active
export const getBannersActive = defineRoute(
  activeBannersHandler
);

// GET /api/pages/:slug
export const getPagesSlug = defineRoute(
  async (req, res) => {
    const page = await cached(`content:pages:${req.params.slug}`, 300, async () => {
      const found = await prisma.page.findUnique({ where: { slug: req.params.slug } });
      if (!found || found.status !== "published") throw NotFound("Page not found");
      return { ...found, content: sanitizeRichText(found.content) };
    }, res);
    return res.json({ success: true, data: page });
  }
);

// GET /api/faqs
export const getFaqs = defineRoute(
  async (req, res) => {
    const { category, q } = req.query;
    const where: any = { status: "active" };
    if (category) where.category = String(category);
    if (q) where.question = { contains: String(q).slice(0, 100), mode: "insensitive" };
    const faqs = await prisma.faq.findMany({ where, orderBy: { displayOrder: "asc" } });
    return res.json({ success: true, data: faqs });
  }
);

// GET /api/faqs/categories
export const getFaqsCategories = defineRoute(
  async (_req, res) => {
    const faqs = await prisma.faq.findMany({ where: { status: "active" }, select: { category: true } });
    const categories = [...new Set(faqs.map((f) => f.category).filter(Boolean))];
    return res.json({ success: true, data: categories });
  }
);

// GET /api/blog
export const getBlog = defineRoute(
  async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { category, q } = req.query;
    const where: any = { status: "published" };
    if (category) where.category = String(category);
    if (q) where.OR = [{ title: { contains: String(q).slice(0, 100), mode: "insensitive" } }, { excerpt: { contains: String(q).slice(0, 100), mode: "insensitive" } }];
    const [total, items] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({ where, orderBy: { publishedAt: "desc" }, skip, take }),
    ]);
    return res.json({ success: true, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  }
);

// GET /api/blog/categories (declared before /blog/:slug, which would otherwise capture it)
export const getBlogCategories = defineRoute(
  async (_req, res) => {
    const posts = await prisma.blogPost.findMany({ where: { status: "published" }, select: { category: true } });
    const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))];
    return res.json({ success: true, data: categories });
  }
);

// GET /api/blog/:slug
export const getBlogSlug = defineRoute(
  async (req, res) => {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
    if (!post || post.status !== "published") throw NotFound("Blog post not found");
    await prisma.blogPost.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
    return res.json({ success: true, data: { ...post, content: sanitizeRichText(post.content) } });
  }
);

// POST /api/newsletter/subscribe
export const postNewsletterSubscribe = defineRoute(
  validate(z.object({ email: z.string().email().max(200).transform((e) => e.toLowerCase()) })),
  rateLimit({ max: 10 }),
  async (req, res) => {
    await prisma.newsletterSubscriber.upsert({
      where: { email: req.body.email },
      update: {},
      create: { email: req.body.email },
    });
    return res.json({ success: true, data: { message: "Subscribed successfully" } });
  }
);

// POST /api/contact
export const postContact = defineRoute(
  validate(z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(200), phone: z.string().max(20).optional(), subject: z.string().max(200).optional(), message: z.string().trim().min(5).max(5000) })),
  rateLimit({ max: 10 }),
  async (req, res) => {
    await prisma.contactMessage.create({ data: req.body });
    return res.json({ success: true, data: { message: "Message sent. We will get back to you shortly." } });
  }
);

// GET /api/company-info
export const getCompanyInfo = defineRoute(
  async (_req, res) => {
    const general = await getSettingsGroup("general");
    return res.json({
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
  }
);
