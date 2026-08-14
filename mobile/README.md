# Baba Communication — Android App (Flutter)

Flutter client for the Baba Communication B2B mobile spare parts platform.
Talks to the same REST API as the customer website (`apps/api`).

## Screens

- **Auth** — splash, login (OTP fallback), register with OTP verification, forgot/reset password
- **Store** — home (banners, categories, featured/trending/new, offers), categories, brands,
  product listing (filters: brand/category/price/stock, 6 sorts, grid/list, infinite scroll),
  product detail (gallery, specs, reviews, related)
- **Commerce** — cart (quantity, save-for-later, coupons), checkout (address → shipping →
  COD or Razorpay-mock → verify), orders with status tabs, order detail (timeline, cancel,
  reorder, invoice), wishlist
- **Account** — profile, addresses CRUD + default, notifications, settings, guest order tracking

## Run

```bash
flutter pub get
flutter run                          # emulator/device; API default http://10.0.2.2:4000/api
flutter run --dart-define=API_URL=http://localhost:4000/api   # web/desktop
```

Start the API first (`npm run dev:api` from the repo root). In dev the API returns OTP
codes as `debugCode` — the OTP screen displays them, so registration works without an SMS gateway.

## Verify

```bash
flutter analyze     # clean
flutter test        # unit + widget tests
```
