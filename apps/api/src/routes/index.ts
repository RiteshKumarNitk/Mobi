import { Router } from "express";
import { activeBannersHandler } from "./content";
import { authRouter } from "./auth";
import { otpRouter } from "./otp";
import { productsRouter } from "./products";
import { categoriesRouter } from "./categories";
import { brandsRouter } from "./brands";
import { searchRouter } from "./search";
import { cartRouter } from "./cart";
import { wishlistRouter } from "./wishlist";
import { ordersRouter } from "./orders";
import { paymentsRouter } from "./payments";
import { offersRouter } from "./offers";
import { productReviewsRouter, reviewsRouter } from "./reviews";
import { returnsRouter } from "./returns";
import { notificationsRouter } from "./notifications";
import { customersRouter } from "./customers";
import { contentRouter } from "./content";
import { adminRouter } from "./admin";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/otp", otpRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/brands", brandsRouter);
apiRouter.use("/search", searchRouter);
apiRouter.use("/cart", cartRouter);
apiRouter.use("/wishlist", wishlistRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/offers", offersRouter);
apiRouter.use("/products", productReviewsRouter); // GET/POST /api/products/:id/reviews
apiRouter.use("/reviews", reviewsRouter);
apiRouter.use("/returns", returnsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/customers", customersRouter);
apiRouter.use("/content", contentRouter);
apiRouter.use("/admin", adminRouter);
// The storefront calls content endpoints at the top level (/api/pages/:slug,
// /api/faqs, /api/blog, /api/contact, /api/newsletter/subscribe,
// /api/company-info). Mounted last so it can never shadow the routers above;
// /api/content/* stays available for existing clients.
apiRouter.use("/", contentRouter);

// GET /api/banners/active (spec'd top-level endpoint)
const bannersRouter = Router();
bannersRouter.get("/active", activeBannersHandler);
apiRouter.use("/banners", bannersRouter);
