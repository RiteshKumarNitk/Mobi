import { Router } from "express";
import { adminDashboardRouter } from "./dashboard";
import { adminCatalogRouter } from "./catalog";
import { adminOrdersRouter, adminReturnsRouter } from "./orders";
import { adminCustomersRouter } from "./customers";
import { adminMarketingRouter } from "./marketing";
import { adminContentRouter } from "./content";
import { adminSystemRouter } from "./system";

export const adminRouter = Router();

adminRouter.use("/dashboard", adminDashboardRouter);
adminRouter.use("/", adminCatalogRouter); // products, categories, brands, inventory
adminRouter.use("/orders", adminOrdersRouter);
adminRouter.use("/returns", adminReturnsRouter);
adminRouter.use("/customers", adminCustomersRouter);
adminRouter.use("/", adminMarketingRouter); // coupons, offers, banners
adminRouter.use("/", adminContentRouter); // pages, faqs, blog
adminRouter.use("/", adminSystemRouter); // settings, roles, permissions, logs, reports, backups
