import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncH } from "../../lib/async";
import { NotFound } from "../../lib/errors";
import { paginate, slugify } from "../../lib/helpers";
import { cacheBustAll } from "../../lib/cache";
import { adminRequired, can } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { logActivity } from "../../lib/activity";

export const adminContentRouter = Router();

adminContentRouter.use(adminRequired);

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

// GET /api/admin/pages
adminContentRouter.get(
  "/pages",
  asyncH(async (_req, res) => {
    const pages = await prisma.page.findMany({ orderBy: { updatedAt: "desc" } });
    res.json({ success: true, data: pages });
  })
);

// GET /api/admin/pages/:slug
adminContentRouter.get(
  "/pages/:slug",
  asyncH(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { slug: req.params.slug } });
    if (!page) throw NotFound("Page not found");
    res.json({ success: true, data: page });
  })
);

// PUT /api/admin/pages/:slug
adminContentRouter.put(
  "/pages/:slug",
  can("content.edit"),
  validate(z.object({ title: z.string().min(2), content: z.string().optional(), metaTitle: z.string().optional(), metaDescription: z.string().optional(), status: z.string().optional() })),
  asyncH(async (req, res) => {
    const page = await prisma.page.upsert({
      where: { slug: req.params.slug },
      update: { ...req.body, slug: req.params.slug },
      create: { ...req.body, slug: req.params.slug },
    });
    await logActivity(req, "page.update", "page", page.id);
    cacheBustAll();
    res.json({ success: true, data: page });
  })
);

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

const faqSchema = z.object({
  question: z.string().min(3),
  answer: z.string().min(3),
  category: z.string().optional(),
  displayOrder: z.number().int().optional(),
  status: z.string().optional(),
});

adminContentRouter.get(
  "/faqs",
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const [total, items] = await Promise.all([
      prisma.faq.count(),
      prisma.faq.findMany({ orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }], skip, take }),
    ]);
    res.json({ success: true, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  })
);

adminContentRouter.post(
  "/faqs",
  can("content.edit"),
  validate(faqSchema),
  asyncH(async (req, res) => {
    const faq = await prisma.faq.create({ data: { ...req.body, category: req.body.category ?? "General" } });
    await logActivity(req, "faq.create", "faq", faq.id);
    cacheBustAll();
    res.json({ success: true, data: faq });
  })
);

adminContentRouter.put(
  "/faqs/:id",
  can("content.edit"),
  validate(faqSchema.partial()),
  asyncH(async (req, res) => {
    const faq = await prisma.faq.update({ where: { id: req.params.id }, data: req.body });
    await logActivity(req, "faq.update", "faq", faq.id);
    cacheBustAll();
    res.json({ success: true, data: faq });
  })
);

adminContentRouter.delete(
  "/faqs/:id",
  can("content.edit"),
  asyncH(async (req, res) => {
    await prisma.faq.delete({ where: { id: req.params.id } });
    await logActivity(req, "faq.delete", "faq", req.params.id);
    cacheBustAll();
    res.json({ success: true, data: { message: "FAQ deleted" } });
  })
);

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------

const blogSchema = z.object({
  title: z.string().min(3),
  slug: z.string().optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  category: z.string().optional(),
  featuredImage: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "published"]).optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
});

adminContentRouter.get(
  "/blog",
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { status } = req.query;
    const where: any = {};
    if (status) where.status = String(status);
    const [total, items] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }),
    ]);
    res.json({ success: true, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  })
);

adminContentRouter.post(
  "/blog",
  can("content.edit"),
  validate(blogSchema),
  asyncH(async (req, res) => {
    const d = req.body;
    const baseSlug = d.slug || slugify(d.title);
    let slug = baseSlug;
    if (await prisma.blogPost.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const post = await prisma.blogPost.create({
      data: {
        title: d.title,
        slug,
        content: d.content ?? null,
        excerpt: d.excerpt ?? null,
        category: d.category ?? null,
        featuredImage: d.featuredImage ?? null,
        tags: d.tags?.length ? d.tags : null,
        status: d.status ?? "draft",
        metaTitle: d.metaTitle ?? null,
        metaDescription: d.metaDescription ?? null,
        publishedAt: d.status === "published" ? new Date() : null,
      },
    });
    await logActivity(req, "blog.create", "blog", post.id);
    cacheBustAll();
    res.json({ success: true, data: post });
  })
);

adminContentRouter.put(
  "/blog/:id",
  can("content.edit"),
  validate(blogSchema.partial()),
  asyncH(async (req, res) => {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound("Blog post not found");
    const d = req.body;
    const data: any = { ...d };
    if (d.tags !== undefined) data.tags = d.tags.length ? d.tags : null;
    if (d.status === "published" && existing.status !== "published") data.publishedAt = new Date();
    const post = await prisma.blogPost.update({ where: { id: existing.id }, data });
    await logActivity(req, "blog.update", "blog", post.id);
    cacheBustAll();
    res.json({ success: true, data: post });
  })
);

adminContentRouter.delete(
  "/blog/:id",
  can("content.edit"),
  asyncH(async (req, res) => {
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    await logActivity(req, "blog.delete", "blog", req.params.id);
    cacheBustAll();
    res.json({ success: true, data: { message: "Blog post deleted" } });
  })
);
