import { expect, test, type Page } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:4000/api";

async function inStockProductId(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/products?stock=in&pageSize=20`);
  const body = await res.json();
  const p = body.data.items.find((i: any) => i.stockQuantity >= 5 && !i.boxQuantity) ?? body.data.items[0];
  expect(p, "an in-stock product exists").toBeTruthy();
  return p.id;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

const uniquePhone = () => `7${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`;

test("content pages that used to 404 now render (CMS, FAQs, blog)", async ({ page }) => {
  await page.goto("/page/about");
  await expect(page.locator("h1")).not.toHaveText(/Loading/);
  await expect(page.locator("main .panel")).not.toBeEmpty();
  await page.goto("/faqs");
  await expect(page.locator("main")).toContainText(/\?/);
  await page.goto("/blog");
  await expect(page.locator("main")).not.toContainText("Loading…");
});

test("guest cart -> register with OTP -> checkout (COD) -> confirmation", async ({ page, request }) => {
  const productId = await inStockProductId(request);

  // 1. Guest adds a product to the cart
  await page.goto(`/products/${productId}`);
  await page.getByRole("button", { name: "Add to Cart", exact: true }).click();
  await expect(page.getByRole("button", { name: /Added to cart/i }).first()).toBeVisible();

  // 2. Register (the OTP is displayed on screen while no SMS gateway is configured)
  const phone = uniquePhone();
  await page.goto("/register");
  await page.getByLabel("Full Name *").fill("E2E Shopkeeper");
  await page.getByLabel("Phone Number *").fill(phone);
  await page.getByLabel("Password *", { exact: true }).fill("E2eTest1234");
  await page.getByLabel("Confirm Password *").fill("E2eTest1234");
  await page.locator("#reg-agree").check();
  await page.getByRole("button", { name: /Register & Get OTP/i }).click();
  const otpBanner = page.getByText(/Your verification code is/i);
  await expect(otpBanner).toBeVisible();
  const code = (await otpBanner.locator("strong").innerText()).trim();
  await page.getByLabel("Enter OTP").fill(code);
  await page.getByRole("button", { name: /Verify/i }).click();
  await page.waitForURL(/\/account/);

  // 3. The guest cart was merged into the new account
  await page.goto("/cart");
  await expect(page.getByRole("link", { name: /Proceed to Checkout/i })).toBeVisible();
  await page.getByRole("link", { name: /Proceed to Checkout/i }).click();
  await page.waitForURL(/\/checkout/);
  await noHorizontalOverflow(page);

  // 4. Add a delivery address
  await page.getByRole("button", { name: /Add New Address/i }).click();
  await page.locator("#addr-fullName").fill("E2E Shopkeeper");
  await page.locator("#addr-phone").fill(phone);
  await page.locator("#addr-line1").fill("12 Test Market Road");
  await page.locator("#addr-city").fill("Delhi");
  await page.locator("#addr-state").fill("Delhi");
  await page.locator("#addr-pincode").fill("110001");
  await page.getByRole("button", { name: /Save & Use/i }).click();
  await page.getByRole("button", { name: /Continue/i }).click();

  // 5. Cash on Delivery (never a real payment in tests)
  await page.getByText("Cash on Delivery", { exact: true }).click();
  await page.getByRole("button", { name: /Review Order/i }).click();
  await page.getByRole("button", { name: /Place Order/i }).click();

  // 6. Confirmation with a real order number
  await page.waitForURL(/\/confirmation/);
  await expect(page.getByRole("heading", { name: /Order Placed/i })).toBeVisible();
  await expect(page.locator("h2")).toHaveText(/^BC-/);
  await noHorizontalOverflow(page);
});

test("login rejects an open-redirect ?next= target", async ({ page }) => {
  await page.goto("/login?next=https://evil.example.com");
  await page.locator("#phone").fill("8888888888");
  await page.locator("#password").fill("Customer@123");
  await page.getByRole("button", { name: /^Login$/ }).click();
  await page.waitForURL((url) => url.pathname === "/account");
  expect(new URL(page.url()).host).not.toContain("evil.example.com");
});

test("private pages are not indexable; robots and sitemap are served", async ({ page, request }) => {
  await page.goto("/checkout");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /checkout");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).toContain("/products/");
});
