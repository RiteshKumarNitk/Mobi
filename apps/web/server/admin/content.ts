import { defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { NotFound } from "../../lib/errors";
import { paginate, slugify } from "../../lib/helpers";
import { cacheBustAll } from "../../lib/cache";
import { adminRequired, can } from "../../lib/auth";
import { validate } from "../../lib/validate";
import { logActivity } from "../../lib/activity";
import { sanitizeRichText } from "../../lib/sanitize";

/** Rich text is sanitized on write (scripts, handlers, javascript: links removed). */
const richText = z.string().max(200_000).transform((html) => sanitizeRichText(html) ?? "");

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

// GET /api/admin/pages
export const getPages = defineRoute(
  adminRequired,
  async (_req, res) => {
    const pages = await prisma.page.findMany({ orderBy: { updatedAt: "desc" } });
    return res.json({ success: true, data: pages });
  }
);

// GET /api/admin/pages/:slug
export const getPagesSlug = defineRoute(
  adminRequired,
  async (req, res) => {
    const page = await prisma.page.findUnique({ where: { slug: req.params.slug } });
    if (!page) throw NotFound("Page not found");
    return res.json({ success: true, data: page });
  }
);

// PUT /api/admin/pages/:slug
export const putPagesSlug = defineRoute(
  adminRequired,
  can("content.edit"),
  validate(
    z.object({
      title: z.string().trim().min(2).max(200),
      content: richText.optional(),
      metaTitle: z.string().max(200).optional(),
      metaDescription: z.string().max(500).optional(),
      status: z.enum(["draft", "published"]).optional(),
    })
  ),
  async (req, res) => {
    const page = await prisma.page.upsert({
      where: { slug: req.params.slug },
      update: { ...req.body, slug: req.params.slug },
      create: { ...req.body, slug: req.params.slug },
    });
    await logActivity(req, "page.update", "page", page.id);
    cacheBustAll();
    return res.json({ success: true, data: page });
  }
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

export const getFaqs = defineRoute(
  adminRequired,
  async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const [total, items] = await Promise.all([
      prisma.faq.count(),
      prisma.faq.findMany({ orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }], skip, take }),
    ]);
    return res.json({ success: true, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  }
);

export const postFaqs = defineRoute(
  adminRequired,
  can("content.edit"),
  validate(faqSchema),
  async (req, res) => {
    const faq = await prisma.faq.create({ data: { ...req.body, category: req.body.category ?? "General" } });
    await logActivity(req, "faq.create", "faq", faq.id);
    cacheBustAll();
    return res.json({ success: true, data: faq });
  }
);

export const putFaqsId = defineRoute(
  adminRequired,
  can("content.edit"),
  validate(faqSchema.partial()),
  async (req, res) => {
    const faq = await prisma.faq.update({ where: { id: req.params.id }, data: req.body });
    await logActivity(req, "faq.update", "faq", faq.id);
    cacheBustAll();
    return res.json({ success: true, data: faq });
  }
);

export const deleteFaqsId = defineRoute(
  adminRequired,
  can("content.edit"),
  async (req, res) => {
    await prisma.faq.delete({ where: { id: req.params.id } });
    await logActivity(req, "faq.delete", "faq", req.params.id);
    cacheBustAll();
    return res.json({ success: true, data: { message: "FAQ deleted" } });
  }
);

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------

const blogSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().max(150).regex(/^[a-z0-9-]*$/, "Slug may contain lowercase letters, digits and dashes").optional(),
  content: richText.optional(),
  excerpt: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  featuredImage: z.string().trim().url().max(1000).refine((s) => /^https?:\/\//i.test(s), "Must be an http(s) URL").optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  status: z.enum(["draft", "published"]).optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
});

export const getBlog = defineRoute(
  adminRequired,
  async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { status } = req.query;
    const where: any = {};
    if (status) where.status = String(status);
    const [total, items] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }),
    ]);
    return res.json({ success: true, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  }
);

export const postBlog = defineRoute(
  adminRequired,
  can("content.edit"),
  validate(blogSchema),
  async (req, res) => {
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
    return res.json({ success: true, data: post });
  }
);

export const putBlogId = defineRoute(
  adminRequired,
  can("content.edit"),
  validate(blogSchema.partial()),
  async (req, res) => {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound("Blog post not found");
    const d = req.body;
    const data: any = { ...d };
    if (d.tags !== undefined) data.tags = d.tags.length ? d.tags : null;
    if (d.status === "published" && existing.status !== "published") data.publishedAt = new Date();
    const post = await prisma.blogPost.update({ where: { id: existing.id }, data });
    await logActivity(req, "blog.update", "blog", post.id);
    cacheBustAll();
    return res.json({ success: true, data: post });
  }
);

export const deleteBlogId = defineRoute(
  adminRequired,
  can("content.edit"),
  async (req, res) => {
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    await logActivity(req, "blog.delete", "blog", req.params.id);
    cacheBustAll();
    return res.json({ success: true, data: { message: "Blog post deleted" } });
  }
);
