import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { NotFound } from "../lib/errors";
import { publicUser } from "../lib/helpers";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";

export const customersRouter = Router();

customersRouter.use(authRequired);

// GET /api/customers/profile
customersRouter.get(
  "/profile",
  asyncH(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user.id },
      include: { settings: true, addresses: { orderBy: { isDefault: "desc" } } },
    });
    if (!user) throw NotFound("User not found");
    res.json({ success: true, data: { user: publicUser(user), settings: user.settings, addresses: user.addresses } });
  })
);

// PUT /api/customers/profile
customersRouter.put(
  "/profile",
  validate(
    z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      shopName: z.string().optional(),
      gstNumber: z.string().optional(),
    })
  ),
  asyncH(async (req, res) => {
    const data: any = { ...req.body };
    if (data.email === "") data.email = null;
    const user = await prisma.user.update({ where: { id: (req as any).user.id }, data });
    res.json({ success: true, data: { user: publicUser(user) } });
  })
);

// POST /api/customers/profile-picture
customersRouter.post(
  "/profile-picture",
  validate(z.object({ imageUrl: z.string().url() })),
  asyncH(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: (req as any).user.id },
      data: { avatarUrl: req.body.imageUrl },
    });
    res.json({ success: true, data: { user: publicUser(user) } });
  })
);

// --- Addresses ---

const addressSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().regex(/^[0-9]{10,15}$/),
  addressLine1: z.string().min(3),
  addressLine2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().regex(/^[0-9]{6}$/),
  country: z.string().optional(),
  addressType: z.string().optional(),
});

// GET /api/customers/addresses
customersRouter.get(
  "/addresses",
  asyncH(async (req, res) => {
    const addresses = await prisma.userAddress.findMany({
      where: { userId: (req as any).user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, data: addresses });
  })
);

// POST /api/customers/addresses
customersRouter.post(
  "/addresses",
  validate(addressSchema),
  asyncH(async (req, res) => {
    const userId = (req as any).user.id;
    const count = await prisma.userAddress.count({ where: { userId } });
    const address = await prisma.userAddress.create({
      data: { ...req.body, userId, isDefault: count === 0 },
    });
    res.json({ success: true, data: address });
  })
);

async function ownedAddress(req: any, id: string) {
  const address = await prisma.userAddress.findFirst({ where: { id, userId: (req as any).user.id } });
  if (!address) throw NotFound("Address not found");
  return address;
}

// PUT /api/customers/addresses/:id
customersRouter.put(
  "/addresses/:id",
  validate(addressSchema.partial()),
  asyncH(async (req, res) => {
    await ownedAddress(req, req.params.id);
    const address = await prisma.userAddress.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: address });
  })
);

// DELETE /api/customers/addresses/:id
customersRouter.delete(
  "/addresses/:id",
  asyncH(async (req, res) => {
    const address = await ownedAddress(req, req.params.id);
    await prisma.userAddress.delete({ where: { id: address.id } });
    if (address.isDefault) {
      const next = await prisma.userAddress.findFirst({ where: { userId: address.userId } });
      if (next) await prisma.userAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    res.json({ success: true, data: { message: "Address deleted" } });
  })
);

// PUT /api/customers/addresses/:id/default
customersRouter.put(
  "/addresses/:id/default",
  asyncH(async (req, res) => {
    const address = await ownedAddress(req, req.params.id);
    await prisma.$transaction([
      prisma.userAddress.updateMany({ where: { userId: address.userId }, data: { isDefault: false } }),
      prisma.userAddress.update({ where: { id: address.id }, data: { isDefault: true } }),
    ]);
    res.json({ success: true, data: { message: "Default address updated" } });
  })
);

// --- Settings ---

// GET /api/customers/settings
customersRouter.get(
  "/settings",
  asyncH(async (req, res) => {
    const settings = await prisma.userSettings.findUnique({ where: { userId: (req as any).user.id } });
    res.json({
      success: true,
      data: settings ?? {
        notificationEmail: true,
        notificationSms: true,
        notificationPush: true,
        language: "en",
        theme: "light",
      },
    });
  })
);

// PUT /api/customers/settings
customersRouter.put(
  "/settings",
  validate(
    z.object({
      notificationEmail: z.boolean().optional(),
      notificationSms: z.boolean().optional(),
      notificationPush: z.boolean().optional(),
      language: z.string().optional(),
      theme: z.string().optional(),
    })
  ),
  asyncH(async (req, res) => {
    const settings = await prisma.userSettings.upsert({
      where: { userId: (req as any).user.id },
      update: req.body,
      create: { userId: (req as any).user.id, ...req.body },
    });
    res.json({ success: true, data: settings });
  })
);
