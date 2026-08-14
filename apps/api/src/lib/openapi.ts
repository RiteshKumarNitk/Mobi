/**
 * OpenAPI 3.0 specification for the Baba Communication B2B platform API.
 * Served as JSON at GET /api/docs.json and rendered with Swagger UI at GET /api/docs.
 *
 * Covers the full public (storefront + customer account) and admin surfaces.
 * All endpoints return `{ success: true, data }` or `{ success: false, error }`.
 */
export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Baba Communication B2B eCommerce API",
    version: "1.0.0",
    description:
      "REST API for the Baba Communication mobile spare parts B2B platform. Public endpoints serve the storefront and customer accounts; `/api/admin/*` endpoints require an authenticated staff user with the matching role.\n\nAuth: register/login returns `accessToken` (Bearer) + `refreshToken`. OTP verification is required to activate an account; in development (`OTP_DEBUG=true`) the API returns `debugCode` instead of sending SMS.",
    contact: { name: "Baba Communication" },
  },
  servers: [{ url: "/api", description: "Same-origin / relative (mounted at /api)" }],
  tags: [
    { name: "Auth & OTP", description: "Registration, login, tokens, password reset" },
    { name: "Catalog", description: "Products, categories, brands, search" },
    { name: "Cart & Wishlist", description: "Bulk-aware cart, coupons, wishlist" },
    { name: "Orders & Payments", description: "Order lifecycle, Razorpay, GST invoices" },
    { name: "Account", description: "Profile, addresses, notifications, returns, reviews" },
    { name: "Content", description: "Pages, FAQs, blog, banners, contact" },
    { name: "Admin", description: "Dashboard, catalog, orders, customers, marketing, system" },
  ],
  paths: {
    // ================= AUTH & OTP =================
    "/auth/register": {
      post: {
        tags: ["Auth & OTP"],
        summary: "Register a customer account",
        description: "Creates the account and sends a phone OTP (debugCode in dev).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterInput" },
            },
          },
        },
        responses: {
          "200": { $ref: "#/components/responses/RegisterOk" },
          "409": { $ref: "#/components/responses/Error" },
          "429": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth & OTP"],
        summary: "Login (customers and staff)",
        description: "Returns access + refresh tokens. Deactivated accounts are rejected; unverified phones receive an OTP and a 403 with code `OTP_REQUIRED`.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginInput" } } },
        },
        responses: {
          "200": { $ref: "#/components/responses/LoginOk" },
          "401": { $ref: "#/components/responses/Error" },
          "429": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth & OTP"],
        summary: "Rotate refresh token",
        description: "Revokes the presented refresh token and issues a new pair.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } },
        },
        responses: { "200": { $ref: "#/components/responses/LoginOk" }, "401": { $ref: "#/components/responses/Error" } },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth & OTP"],
        security: [{ bearerAuth: [] }],
        summary: "Logout — revokes all tokens for the user",
        responses: { "200": { description: "Logged out" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth & OTP"],
        security: [{ bearerAuth: [] }],
        summary: "Current user, settings, addresses",
        responses: { "200": { description: "User + settings + addresses" } },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth & OTP"],
        summary: "Send password-reset OTP",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["phone"], properties: { phone: { type: "string", example: "9876543210" } } } } },
        },
        responses: { "200": { description: "OTP sent" }, "404": { $ref: "#/components/responses/Error" } },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Auth & OTP"],
        summary: "Reset password with OTP",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["phone", "code", "newPassword"], properties: { phone: { type: "string" }, code: { type: "string", minLength: 6, maxLength: 6 }, newPassword: { type: "string", minLength: 6 } } } } },
        },
        responses: { "200": { description: "Password updated" } },
      },
    },
    "/otp/send": {
      post: {
        tags: ["Auth & OTP"],
        summary: "Send an OTP",
        description: "Rate-limited per phone + IP. Returns `debugCode` when `OTP_DEBUG=true`.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["phone", "purpose"], properties: { phone: { type: "string" }, purpose: { type: "string", enum: ["register", "login", "password_reset"] } } } } },
        },
        responses: { "200": { description: "OTP sent (debugCode in dev)" }, "429": { $ref: "#/components/responses/Error" } },
      },
    },
    "/otp/resend": {
      post: {
        tags: ["Auth & OTP"],
        summary: "Resend an OTP",
        responses: { "200": { description: "OTP re-sent" }, "429": { $ref: "#/components/responses/Error" } },
      },
    },
    "/otp/verify": {
      post: {
        tags: ["Auth & OTP"],
        summary: "Verify an OTP",
        description: "On success with purpose `register`, activates the account. Returns tokens when the account is fully verified.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["phone", "purpose", "code"], properties: { phone: { type: "string" }, purpose: { type: "string", enum: ["register", "login", "password_reset"] }, code: { type: "string", minLength: 6, maxLength: 6 } } } } },
        },
        responses: { "200": { description: "Verified" }, "400": { $ref: "#/components/responses/Error" } },
      },
    },

    // ================= CATALOG =================
    "/products": {
      get: {
        tags: ["Catalog"],
        summary: "List products",
        description: "Filtered, sorted, paginated. Cached (60s); responses carry `X-Cache: HIT|MISS`.",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Case-insensitive search on name/SKU/brand" },
          { name: "categoryId", in: "query", schema: { type: "string" } },
          { name: "brandId", in: "query", schema: { type: "string" } },
          { name: "minPrice", in: "query", schema: { type: "number" } },
          { name: "maxPrice", in: "query", schema: { type: "number" } },
          { name: "stock", in: "query", schema: { type: "string", enum: ["in", "out"] } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["price_asc", "price_desc", "newest", "best_selling", "name_asc", "name_desc"] } },
          { name: "featured", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "isNew", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "isBestSeller", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "ids", in: "query", schema: { type: "string" }, description: "Comma-separated product ids" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          "200": {
            description: "Paginated product cards",
            content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/ProductCard" } }, total: { type: "integer" }, page: { type: "integer" }, pageSize: { type: "integer" }, pages: { type: "integer" } } } } } } },
          },
        },
      },
    },
    "/products/featured": { get: { tags: ["Catalog"], summary: "Featured products", responses: { "200": { description: "Product card array" } } } },
    "/products/trending": { get: { tags: ["Catalog"], summary: "Best sellers", responses: { "200": { description: "Product card array" } } } },
    "/products/new": { get: { tags: ["Catalog"], summary: "New arrivals", responses: { "200": { description: "Product card array" } } } },
    "/products/{id}": {
      get: {
        tags: ["Catalog"],
        summary: "Product detail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Full product (attributes, tags, gallery, rating, bulk pricing)", content: { "application/json": { schema: { $ref: "#/components/schemas/ProductDetail" } } } },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/products/{id}/related": {
      get: { tags: ["Catalog"], summary: "Related products", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Product card array" } } },
    },
    "/products/{id}/reviews": {
      get: { tags: ["Account"], summary: "Approved reviews for a product", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Reviews" } } },
      post: {
        tags: ["Account"],
        security: [{ bearerAuth: [] }],
        summary: "Review a product",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ReviewInput" } } } },
        responses: { "200": { description: "Review created" } },
      },
    },
    "/products/{id}/helpful": {
      post: { tags: ["Account"], summary: "Mark a review helpful", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
    },
    "/categories": {
      get: { tags: ["Catalog"], summary: "Category tree", responses: { "200": { description: "Categories with nested children" } } },
    },
    "/categories/{id}": { get: { tags: ["Catalog"], summary: "Category detail", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Category" } } } },
    "/categories/{id}/products": { get: { tags: ["Catalog"], summary: "Products in a category (incl. children)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Product card array" } } } },
    "/brands": { get: { tags: ["Catalog"], summary: "Brand list", responses: { "200": { description: "Brands" } } } },
    "/brands/{id}": { get: { tags: ["Catalog"], summary: "Brand detail", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Brand" } } } },
    "/brands/{id}/products": { get: { tags: ["Catalog"], summary: "Products by brand", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Product card array" } } } },
    "/search": {
      get: {
        tags: ["Catalog"],
        summary: "Full-text search across products",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        ],
        responses: { "200": { description: "Paginated results grouped by product" } },
      },
    },
    "/search/suggest": {
      get: {
        tags: ["Catalog"],
        summary: "Autocomplete suggestions",
        parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Suggested terms" } },
      },
    },

    // ================= CART & WISHLIST =================
    "/cart": {
      get: {
        tags: ["Cart & Wishlist"],
        summary: "Cart for this device",
        description: "Cart is keyed by `X-Device-Id` header (falls back to user). Includes per-line bulk pricing.",
        parameters: [{ name: "X-Device-Id", in: "header", schema: { type: "string" } }],
        responses: { "200": { description: "Cart with items and totals", content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } } } },
      },
    },
    "/cart/add": {
      post: {
        tags: ["Cart & Wishlist"],
        summary: "Add to cart",
        parameters: [{ name: "X-Device-Id", in: "header", schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productId", "quantity"], properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1 } } } } } },
        responses: { "200": { description: "Updated cart" } },
      },
    },
    "/cart/update": {
      put: {
        tags: ["Cart & Wishlist"],
        summary: "Update line quantity",
        parameters: [{ name: "X-Device-Id", in: "header", schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productId", "quantity"], properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 0 } } } } } },
        responses: { "200": { description: "Updated cart" } },
      },
    },
    "/cart/remove": {
      delete: {
        tags: ["Cart & Wishlist"],
        summary: "Remove line",
        parameters: [{ name: "X-Device-Id", in: "header", schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productId"], properties: { productId: { type: "string" } } } } } },
        responses: { "200": { description: "Updated cart" } },
      },
    },
    "/cart/apply-coupon": {
      post: {
        tags: ["Cart & Wishlist"],
        summary: "Apply a coupon",
        parameters: [{ name: "X-Device-Id", in: "header", schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } } },
        responses: { "200": { description: "Updated cart with discount" } },
      },
    },
    "/cart/remove-coupon": {
      delete: { tags: ["Cart & Wishlist"], summary: "Remove applied coupon", parameters: [{ name: "X-Device-Id", in: "header", schema: { type: "string" } }], responses: { "200": { description: "Updated cart" } } },
    },
    "/cart/quick-add": {
      post: {
        tags: ["Cart & Wishlist"],
        summary: "Bulk add by SKU (Quick Order)",
        description: "Accepts a list of SKUs (or a plain-text list) and adds them in one shot; unknown SKUs are reported per line.",
        parameters: [{ name: "X-Device-Id", in: "header", schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["skus"], properties: { skus: { type: "array", items: { type: "string" } } } } } } },
        responses: { "200": { description: "Added lines + failed SKUs" } },
      },
    },
    "/cart/save-for-later": {
      post: { tags: ["Cart & Wishlist"], summary: "Move a line to save-for-later", parameters: [{ name: "X-Device-Id", in: "header", schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productId"], properties: { productId: { type: "string" } } } } } }, responses: { "200": { description: "Updated cart" } } },
    },
    "/wishlist": {
      get: { tags: ["Cart & Wishlist"], security: [{ bearerAuth: [] }], summary: "My wishlist", responses: { "200": { description: "Wishlist items" } } },
    },
    "/wishlist/add": {
      post: { tags: ["Cart & Wishlist"], security: [{ bearerAuth: [] }], summary: "Add to wishlist", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productId"], properties: { productId: { type: "string" } } } } } }, responses: { "200": { description: "Added" } } },
    },
    "/wishlist/remove": {
      delete: { tags: ["Cart & Wishlist"], security: [{ bearerAuth: [] }], summary: "Remove from wishlist", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productId"], properties: { productId: { type: "string" } } } } } }, responses: { "200": { description: "Removed" } } },
    },
    "/wishlist/move-to-cart": {
      post: { tags: ["Cart & Wishlist"], security: [{ bearerAuth: [] }], summary: "Move wishlist item to cart", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productId"], properties: { productId: { type: "string" } } } } } }, responses: { "200": { description: "Moved" } } },
    },

    // ================= ORDERS & PAYMENTS =================
    "/orders/create": {
      post: {
        tags: ["Orders & Payments"],
        security: [{ bearerAuth: [] }],
        summary: "Create an order from the cart",
        description: "Applies bulk (box) pricing automatically once a line reaches its threshold. Creates the Payment row (razorpay or cod) and decrements inventory.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateOrderInput" } } },
        },
        responses: { "200": { description: "Order created" } },
      },
    },
    "/orders": {
      get: { tags: ["Orders & Payments"], security: [{ bearerAuth: [] }], summary: "My orders", responses: { "200": { description: "Paginated orders" } } },
    },
    "/orders/track/{orderNumber}": {
      get: { tags: ["Orders & Payments"], summary: "Track an order by number (no auth)", parameters: [{ name: "orderNumber", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Order status + timeline" }, "404": { $ref: "#/components/responses/Error" } } },
    },
    "/orders/{id}": {
      get: { tags: ["Orders & Payments"], security: [{ bearerAuth: [] }], summary: "Order detail", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Order with items, address, payments" } } },
    },
    "/orders/{id}/status": {
      get: { tags: ["Orders & Payments"], summary: "Public order status", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Status" } } },
    },
    "/orders/{id}/invoice": {
      get: {
        tags: ["Orders & Payments"],
        summary: "GST invoice for an order",
        description: "Full GST-compliant invoice: seller/buyer GSTIN, HSN codes, CGST/SGST breakup, box-price-aware totals.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Invoice object", content: { "application/json": { schema: { $ref: "#/components/schemas/Invoice" } } } } },
      },
    },
    "/orders/{id}/cancel": {
      post: { tags: ["Orders & Payments"], security: [{ bearerAuth: [] }], summary: "Cancel an order (state machine)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Cancelled" }, "400": { $ref: "#/components/responses/Error" } } },
    },
    "/orders/{id}/reorder": {
      post: { tags: ["Orders & Payments"], security: [{ bearerAuth: [] }], summary: "Re-add all items of an order to the cart", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Cart refilled" } } },
    },
    "/payments/razorpay/create-order": {
      post: { tags: ["Orders & Payments"], summary: "Create a Razorpay order (mock in dev)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["amount", "currency", "receipt"], properties: { amount: { type: "number" }, currency: { type: "string", default: "INR" }, receipt: { type: "string" } } } } } }, responses: { "200": { description: "Razorpay order" } } },
    },
    "/payments/verify": {
      post: { tags: ["Orders & Payments"], summary: "Verify a Razorpay payment signature", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["orderId", "razorpayPaymentId", "razorpaySignature"], properties: { orderId: { type: "string" }, razorpayPaymentId: { type: "string" }, razorpaySignature: { type: "string" } } } } } }, responses: { "200": { description: "Verified; order marked paid" } } },
    },

    // ================= ACCOUNT =================
    "/customers/profile": {
      get: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "My profile", responses: { "200": { description: "User" } } },
      put: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Update profile", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string", format: "email" }, shopName: { type: "string" }, gstNumber: { type: "string" } } } } } }, responses: { "200": { description: "Updated" } } },
    },
    "/customers/profile-picture": {
      post: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Upload profile picture", requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { image: { type: "string", format: "binary" } } } } } }, responses: { "200": { description: "Updated" } } },
    },
    "/customers/addresses": {
      get: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "My addresses", responses: { "200": { description: "Address list" } } },
      post: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Add address", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AddressInput" } } } }, responses: { "200": { description: "Created" } } },
    },
    "/customers/addresses/{id}": {
      put: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Update address", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AddressInput" } } } }, responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Delete address", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/customers/addresses/{id}/default": {
      put: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Set default address", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Set" } } },
    },
    "/customers/settings": {
      get: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "My notification settings", responses: { "200": { description: "Settings" } } },
      put: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Update settings", responses: { "200": { description: "Updated" } } },
    },
    "/notifications": {
      get: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "My notifications", responses: { "200": { description: "Notifications" } } },
    },
    "/notifications/mark-all-read": {
      put: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Mark all read", responses: { "200": { description: "Done" } } },
    },
    "/notifications/{id}/read": {
      put: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Mark one read", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Done" } } },
    },
    "/returns/create": {
      post: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Request a return", description: "Requires a delivered order line.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["orderId", "orderItemId", "reason"], properties: { orderId: { type: "string" }, orderItemId: { type: "string" }, reason: { type: "string" }, notes: { type: "string" }, quantity: { type: "integer", default: 1 } } } } } }, responses: { "200": { description: "Return request created" } } },
    },
    "/returns": { get: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "My return requests", responses: { "200": { description: "Returns" } } } },
    "/returns/{id}": { get: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Return detail", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Return" } } } },
    "/reviews/{id}": {
      put: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Edit my review", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ReviewInput" } } } }, responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Account"], security: [{ bearerAuth: [] }], summary: "Delete my review", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/offers": { get: { tags: ["Content"], summary: "Active offers", responses: { "200": { description: "Offers" } } } },
    "/offers/{id}": { get: { tags: ["Content"], summary: "Offer detail", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Offer" } } } },

    // ================= CONTENT =================
    "/banners/active": { get: { tags: ["Content"], summary: "Active banners", responses: { "200": { description: "Banners" } } } },
    "/content/pages/{slug}": { get: { tags: ["Content"], summary: "CMS page by slug", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Page" }, "404": { $ref: "#/components/responses/Error" } } } },
    "/content/faqs": { get: { tags: ["Content"], summary: "FAQs", responses: { "200": { description: "FAQs" } } } },
    "/content/faqs/categories": { get: { tags: ["Content"], summary: "FAQ categories", responses: { "200": { description: "Categories" } } } },
    "/content/blog": { get: { tags: ["Content"], summary: "Blog posts", responses: { "200": { description: "Posts" } } } },
    "/content/blog/categories": { get: { tags: ["Content"], summary: "Blog categories", responses: { "200": { description: "Categories" } } } },
    "/content/blog/{slug}": { get: { tags: ["Content"], summary: "Blog post", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Post" } } } },
    "/content/company-info": { get: { tags: ["Content"], summary: "Company info (settings)", responses: { "200": { description: "Company details" } } } },
    "/content/contact": {
      post: { tags: ["Content"], summary: "Submit contact form", description: "Rate-limited.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "email", "message"], properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, subject: { type: "string" }, message: { type: "string" } } } } } }, responses: { "200": { description: "Sent" }, "429": { $ref: "#/components/responses/Error" } } },
    },
    "/content/newsletter/subscribe": {
      post: { tags: ["Content"], summary: "Subscribe to newsletter", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } }, responses: { "200": { description: "Subscribed" } } },
    },

    // ================= ADMIN =================
    "/admin/dashboard": {
      get: {
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        summary: "Dashboard stats",
        description: "KPIs, 30-day revenue chart, top sellers, recent orders/customers.",
        responses: { "200": { description: "Dashboard data" }, "401": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } },
      },
    },
    "/admin/products": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List products (incl. inactive)", parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { name: "page", in: "query", schema: { type: "integer", default: 1 } }], responses: { "200": { description: "Paginated products" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create product", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductInput" } } } }, responses: { "200": { description: "Created" } } },
    },
    "/admin/products/import": {
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Bulk import products from CSV", description: "Raw CSV body (`text/csv`). Columns: name, sku, price, mrp, stockQuantity, category, brand, boxPrice, boxQuantity, hsnCode, ...", requestBody: { required: true, content: { "text/csv": { schema: { type: "string" } } } }, responses: { "200": { description: "Import result" } } },
    },
    "/admin/products/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update product", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductInput" } } } }, responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete product", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/categories": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List categories", responses: { "200": { description: "Categories" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create category", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, parentId: { type: "string", nullable: true }, image: { type: "string" } } } } } }, responses: { "200": { description: "Created" } } },
    },
    "/admin/categories/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update category", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete category", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/brands": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List brands", responses: { "200": { description: "Brands" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create brand", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, logo: { type: "string" } } } } } }, responses: { "200": { description: "Created" } } },
    },
    "/admin/brands/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update brand", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete brand", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/inventory": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Inventory list (stock, low-stock filter)", responses: { "200": { description: "Inventory" } } } },
    "/admin/inventory/update": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Adjust stock (+in / -out / set)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productId", "type", "quantity"], properties: { productId: { type: "string" }, type: { type: "string", enum: ["in", "out", "set"] }, quantity: { type: "integer" }, note: { type: "string" } } } } } }, responses: { "200": { description: "Adjusted; logged" } } },
    },
    "/admin/inventory/history": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Inventory adjustment log", responses: { "200": { description: "Log" } } } },
    "/admin/orders": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List orders (filters: status, q, date)", parameters: [{ name: "status", in: "query", schema: { type: "string" } }, { name: "q", in: "query", schema: { type: "string" } }, { name: "page", in: "query", schema: { type: "integer", default: 1 } }], responses: { "200": { description: "Paginated orders" } } },
    },
    "/admin/orders/{id}": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Order detail", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Order" } } } },
    "/admin/orders/{id}/status": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Advance order status (state machine)", description: "Valid transitions: pending→confirmed→packed→shipped→delivered; cancel/refund paths enforced.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string" }, note: { type: "string" } } } } } }, responses: { "200": { description: "Updated" }, "400": { $ref: "#/components/responses/Error" } } },
    },
    "/admin/orders/{id}/cancel": { post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Cancel an order", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Cancelled" } } } },
    "/admin/orders/{id}/refund": {
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Process a refund (Razorpay in prod, mock in dev)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["amount"], properties: { amount: { type: "number" }, reason: { type: "string" } } } } } }, responses: { "200": { description: "Refunded" } } },
    },
    "/admin/orders/{id}/invoice": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "GST invoice for an order", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Invoice" } } } },
    "/admin/returns": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List return requests", responses: { "200": { description: "Returns" } } } },
    "/admin/returns/{id}/status": { put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update return status", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } } },
    "/admin/returns/{id}/refund": { post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Refund a return", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["amount"], properties: { amount: { type: "number" } } } } } }, responses: { "200": { description: "Refunded" } } } },
    "/admin/customers": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List customers", parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { name: "page", in: "query", schema: { type: "integer", default: 1 } }], responses: { "200": { description: "Customers" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create customer", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["phone", "name"], properties: { phone: { type: "string" }, name: { type: "string" }, email: { type: "string" }, password: { type: "string" } } } } } }, responses: { "200": { description: "Created" } } },
    },
    "/admin/customers/{id}": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Customer detail", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Customer" } } },
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update customer (status, notes)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete customer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/customers/{id}/orders": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Orders for a customer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Orders" } } } },
    "/admin/coupons": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List coupons", responses: { "200": { description: "Coupons" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create coupon", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CouponInput" } } } }, responses: { "200": { description: "Created" } } },
    },
    "/admin/coupons/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update coupon", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete coupon", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/coupons/{id}/usage": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Coupon usage stats", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Usage" } } } },
    "/admin/offers": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List offers", responses: { "200": { description: "Offers" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create offer", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title", "type"], properties: { title: { type: "string" }, type: { type: "string" }, description: { type: "string" }, discountPercent: { type: "number" }, startsAt: { type: "string", format: "date-time" }, endsAt: { type: "string", format: "date-time" }, active: { type: "boolean" } } } } } }, responses: { "200": { description: "Created" } } },
    },
    "/admin/offers/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update offer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete offer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/banners": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List banners", responses: { "200": { description: "Banners" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create banner", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title", "image"], properties: { title: { type: "string" }, image: { type: "string" }, link: { type: "string" }, position: { type: "string" }, active: { type: "boolean" } } } } } }, responses: { "200": { description: "Created" } } },
    },
    "/admin/banners/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update banner", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete banner", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/pages": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List CMS pages", responses: { "200": { description: "Pages" } } } },
    "/admin/pages/{slug}": { put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Save page content", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } } } } } }, responses: { "200": { description: "Saved" } } } },
    "/admin/faqs": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List FAQs", responses: { "200": { description: "FAQs" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create FAQ", responses: { "200": { description: "Created" } } },
    },
    "/admin/faqs/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update FAQ", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete FAQ", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/blog": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List blog posts", responses: { "200": { description: "Posts" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create blog post", responses: { "200": { description: "Created" } } },
    },
    "/admin/blog/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update blog post", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete blog post", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/settings": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "All settings groups", responses: { "200": { description: "Settings" } } } },
    "/admin/settings/{group}": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Settings group", parameters: [{ name: "group", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Settings" } } },
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Save settings group", parameters: [{ name: "group", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, responses: { "200": { description: "Saved" } } },
    },
    "/admin/roles": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List roles with permissions", responses: { "200": { description: "Roles" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create role", responses: { "200": { description: "Created" } } },
    },
    "/admin/roles/{id}": {
      put: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Update role / permissions", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Delete role", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/admin/permissions": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Available permissions", responses: { "200": { description: "Permissions" } } } },
    "/admin/logs": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Activity log", parameters: [{ name: "page", in: "query", schema: { type: "integer", default: 1 } }], responses: { "200": { description: "Log entries" } } } },
    "/admin/logs/{type}": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "System logs by type", parameters: [{ name: "type", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Logs" } } } },
    "/admin/logs/export": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Export activity log (CSV)", responses: { "200": { description: "CSV download" } } } },
    "/admin/reports/sales": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Sales report", responses: { "200": { description: "Report" } } } },
    "/admin/reports/orders": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Orders report", responses: { "200": { description: "Report" } } } },
    "/admin/reports/customers": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Customers report", responses: { "200": { description: "Report" } } } },
    "/admin/reports/inventory": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Inventory report", responses: { "200": { description: "Report" } } } },
    "/admin/backups": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "List backups", responses: { "200": { description: "Backups" } } },
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Create backup", responses: { "200": { description: "Created" } } },
    },
    "/admin/backups/{id}/download": { get: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Download backup", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Backup file" } } } },
    "/admin/backups/{id}/restore": { post: { tags: ["Admin"], security: [{ bearerAuth: [] }], summary: "Restore backup", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Restored" } } } },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Access token from POST /auth/login" },
    },
    responses: {
      Error: {
        description: "Error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      RegisterOk: {
        description: "Account created; OTP sent",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean", example: true },
                data: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                    otpSent: { type: "boolean", example: true },
                    expiresIn: { type: "integer", example: 300 },
                    debugCode: { type: "string", nullable: true, description: "Only when OTP_DEBUG=true" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      LoginOk: {
        description: "Tokens",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean", example: true },
                data: {
                  type: "object",
                  properties: {
                    accessToken: { type: "string" },
                    refreshToken: { type: "string" },
                    expiresIn: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    schemas: {
      ApiError: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "NOT_FOUND" },
              message: { type: "string", example: "Product not found" },
            },
          },
        },
      },
      RegisterInput: {
        type: "object",
        required: ["phone", "password", "name"],
        properties: {
          phone: { type: "string", example: "9876543210", pattern: "^[0-9]{10,15}$" },
          password: { type: "string", minLength: 6 },
          name: { type: "string", minLength: 2 },
          email: { type: "string", format: "email" },
          shopName: { type: "string" },
          gstNumber: { type: "string" },
        },
      },
      LoginInput: {
        type: "object",
        required: ["phone", "password"],
        properties: {
          phone: { type: "string", example: "9876543210" },
          password: { type: "string" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string", nullable: true },
          phone: { type: "string" },
          email: { type: "string", nullable: true },
          shopName: { type: "string", nullable: true },
          gstNumber: { type: "string", nullable: true },
          phoneVerified: { type: "boolean" },
          status: { type: "string", enum: ["active", "inactive", "pending"] },
          role: { type: "string" },
          avatar: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ProductCard: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          sku: { type: "string" },
          slug: { type: "string" },
          price: { type: "string", description: "Stringified to preserve INR paise precision" },
          mrp: { type: "string", nullable: true },
          boxPrice: { type: "string", nullable: true, description: "Bulk (box) rate per unit" },
          boxQuantity: { type: "integer", nullable: true, description: "Quantity threshold for the box rate" },
          hsnCode: { type: "string", nullable: true },
          stockQuantity: { type: "integer" },
          stockStatus: { type: "string" },
          isFeatured: { type: "boolean" },
          isNew: { type: "boolean" },
          isBestSeller: { type: "boolean" },
          image: { type: "string", nullable: true },
          brand: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" } } },
          category: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" } } },
        },
      },
      ProductDetail: {
        allOf: [
          { $ref: "#/components/schemas/ProductCard" },
          {
            type: "object",
            properties: {
              description: { type: "string" },
              shortDescription: { type: "string", nullable: true },
              attributes: { type: "array", items: { type: "object" } },
              tags: { type: "array", items: { type: "string" } },
              gallery: { type: "array", items: { type: "object", properties: { url: { type: "string" }, isPrimary: { type: "boolean" } } } },
              rating: { type: "number" },
              reviewCount: { type: "integer" },
            },
          },
        ],
      },
      ProductInput: {
        type: "object",
        required: ["name", "price", "categoryId", "brandId"],
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          mrp: { type: "number" },
          boxPrice: { type: "number", description: "Bulk per-unit rate (wholesale)" },
          boxQuantity: { type: "integer", description: "Units that unlock the box rate" },
          hsnCode: { type: "string" },
          stockQuantity: { type: "integer" },
          categoryId: { type: "string" },
          brandId: { type: "string" },
          shortDescription: { type: "string" },
          description: { type: "string" },
          isFeatured: { type: "boolean" },
          isNew: { type: "boolean" },
          isBestSeller: { type: "boolean" },
          status: { type: "string", enum: ["active", "inactive"] },
          images: { type: "array", items: { type: "string" } },
        },
      },
      ReviewInput: {
        type: "object",
        required: ["rating", "comment"],
        properties: {
          rating: { type: "integer", minimum: 1, maximum: 5 },
          comment: { type: "string", minLength: 3 },
        },
      },
      AddressInput: {
        type: "object",
        required: ["fullName", "phone", "line1", "city", "state", "pincode"],
        properties: {
          fullName: { type: "string" },
          phone: { type: "string" },
          line1: { type: "string" },
          line2: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          pincode: { type: "string" },
          isDefault: { type: "boolean" },
        },
      },
      Cart: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: { type: "string" },
                name: { type: "string" },
                sku: { type: "string" },
                image: { type: "string" },
                quantity: { type: "integer" },
                price: { type: "string", description: "Effective unit price (box rate applied at threshold)" },
                lineTotal: { type: "string" },
                bulkApplied: { type: "boolean" },
                boxPrice: { type: "string", nullable: true },
                boxQuantity: { type: "integer", nullable: true },
                savedForLater: { type: "boolean" },
              },
            },
          },
          totals: {
            type: "object",
            properties: {
              subtotal: { type: "string" },
              discount: { type: "string" },
              shipping: { type: "string" },
              total: { type: "string" },
            },
          },
          coupon: { type: "object", nullable: true },
        },
      },
      CreateOrderInput: {
        type: "object",
        required: ["addressId", "paymentMethod"],
        properties: {
          addressId: { type: "string" },
          paymentMethod: { type: "string", enum: ["cod", "razorpay"] },
          notes: { type: "string" },
          useWallet: { type: "boolean" },
        },
      },
      Invoice: {
        type: "object",
        description: "GST-compliant invoice",
        properties: {
          invoiceNumber: { type: "string", example: "INV-BC-DEMO0001" },
          invoiceDate: { type: "string", format: "date-time" },
          seller: {
            type: "object",
            properties: {
              name: { type: "string" },
              gst: { type: "string", example: "07AABCB1234F1Z5" },
              address: { type: "string" },
              phone: { type: "string" },
            },
          },
          buyer: { type: "object", properties: { name: { type: "string" }, gst: { type: "string" }, address: { type: "string" }, phone: { type: "string" } } },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                hsn: { type: "string" },
                quantity: { type: "integer" },
                rate: { type: "string" },
                amount: { type: "string" },
              },
            },
          },
          taxableValue: { type: "string" },
          cgst: { type: "string" },
          sgst: { type: "string" },
          total: { type: "string" },
          amountInWords: { type: "string" },
          terms: { type: "string" },
        },
      },
      CouponInput: {
        type: "object",
        required: ["code", "type", "value"],
        properties: {
          code: { type: "string" },
          type: { type: "string", enum: ["percentage", "fixed"] },
          value: { type: "number" },
          minOrderValue: { type: "number" },
          maxDiscount: { type: "number" },
          usageLimit: { type: "integer" },
          perUserLimit: { type: "integer" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          active: { type: "boolean" },
        },
      },
    },
  },
} as const;
