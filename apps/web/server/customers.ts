import { defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { NotFound } from "../lib/errors";
import { publicUser } from "../lib/helpers";
import { authRequired } from "../lib/auth";
import { validate } from "../lib/validate";

// GET /api/customers/profile
export const getProfile = defineRoute(
  authRequired,
  async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { settings: true, addresses: { orderBy: { isDefault: "desc" } } },
    });
    if (!user) throw NotFound("User not found");
    return res.json({ success: true, data: { user: publicUser(user), settings: user.settings, addresses: user.addresses } });
  }
);

// PUT /api/customers/profile
export const putProfile = defineRoute(
  authRequired,
  validate(
    z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      shopName: z.string().optional(),
      gstNumber: z.string().optional(),
    })
  ),
  async (req, res) => {
    const data: any = { ...req.body };
    if (data.email === "") data.email = null;
    const user = await prisma.user.update({ where: { id: req.user!.id }, data });
    return res.json({ success: true, data: { user: publicUser(user) } });
  }
);

// POST /api/customers/profile-picture
export const postProfilePicture = defineRoute(
  authRequired,
  validate(z.object({ imageUrl: z.string().url() })),
  async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: req.body.imageUrl },
    });
    return res.json({ success: true, data: { user: publicUser(user) } });
  }
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
export const getAddresses = defineRoute(
  authRequired,
  async (req, res) => {
    const addresses = await prisma.userAddress.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return res.json({ success: true, data: addresses });
  }
);

// POST /api/customers/addresses
export const postAddresses = defineRoute(
  authRequired,
  validate(addressSchema),
  async (req, res) => {
    const userId = req.user!.id;
    const count = await prisma.userAddress.count({ where: { userId } });
    const address = await prisma.userAddress.create({
      data: { ...req.body, userId, isDefault: count === 0 },
    });
    return res.json({ success: true, data: address });
  }
);

async function ownedAddress(req: any, id: string) {
  const address = await prisma.userAddress.findFirst({ where: { id, userId: req.user!.id } });
  if (!address) throw NotFound("Address not found");
  return address;
}

// PUT /api/customers/addresses/:id
export const putAddressesId = defineRoute(
  authRequired,
  validate(addressSchema.partial()),
  async (req, res) => {
    await ownedAddress(req, req.params.id);
    const address = await prisma.userAddress.update({ where: { id: req.params.id }, data: req.body });
    return res.json({ success: true, data: address });
  }
);

// DELETE /api/customers/addresses/:id
export const deleteAddressesId = defineRoute(
  authRequired,
  async (req, res) => {
    const address = await ownedAddress(req, req.params.id);
    await prisma.userAddress.delete({ where: { id: address.id } });
    if (address.isDefault) {
      const next = await prisma.userAddress.findFirst({ where: { userId: address.userId } });
      if (next) await prisma.userAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return res.json({ success: true, data: { message: "Address deleted" } });
  }
);

// PUT /api/customers/addresses/:id/default
export const putAddressesIdDefault = defineRoute(
  authRequired,
  async (req, res) => {
    const address = await ownedAddress(req, req.params.id);
    await prisma.$transaction([
      prisma.userAddress.updateMany({ where: { userId: address.userId }, data: { isDefault: false } }),
      prisma.userAddress.update({ where: { id: address.id }, data: { isDefault: true } }),
    ]);
    return res.json({ success: true, data: { message: "Default address updated" } });
  }
);

// --- Settings ---

// GET /api/customers/settings
export const getSettings = defineRoute(
  authRequired,
  async (req, res) => {
    const settings = await prisma.userSettings.findUnique({ where: { userId: req.user!.id } });
    return res.json({
      success: true,
      data: settings ?? {
        notificationEmail: true,
        notificationSms: true,
        notificationPush: true,
        language: "en",
        theme: "light",
      },
    });
  }
);

// PUT /api/customers/settings
export const putSettings = defineRoute(
  authRequired,
  validate(
    z.object({
      notificationEmail: z.boolean().optional(),
      notificationSms: z.boolean().optional(),
      notificationPush: z.boolean().optional(),
      language: z.string().optional(),
      theme: z.string().optional(),
    })
  ),
  async (req, res) => {
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user!.id },
      update: req.body,
      create: { userId: req.user!.id, ...req.body },
    });
    return res.json({ success: true, data: settings });
  }
);
