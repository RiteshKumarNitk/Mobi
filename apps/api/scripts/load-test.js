// k6 load test for the Baba Communication API.
//
// Run (requires k6 — https://k6.io):
//   k6 run scripts/load-test.js
// Against a remote deploy:
//   k6 run -e API_URL=https://api.example.com/api scripts/load-test.js
//
// Scenarios: ramps to 100 concurrent users, mostly hitting the cached
// catalog reads the storefront actually makes. Assertions in `thresholds`.

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

// Cache-hit ratio: count catalog reads that return X-Cache: HIT vs total.
const cacheHits = new Counter("cache_hits");
const cacheTotal = new Counter("cache_total");

export const options = {
  stages: [
    { duration: "1m", target: 50 }, // warm-up
    { duration: "3m", target: 100 }, // sustained peak
    { duration: "1m", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<200", "p(99)<500"],
    http_req_failed: ["rate<0.01"],
    "rate(cache_hits/cache_total)": ["rate>0.5"], // at least half of catalog reads should be cache hits
  },
};

const BASE = (__ENV.API_URL || "http://localhost:4000/api").replace(/\/$/, "");

export default function () {
  const vu = __VU; // 1..N, gives each VU a distinct page

  // 1. Product listing (cached) — the highest-traffic endpoint
  const list = http.get(`${BASE}/products?page=${1 + (vu % 5)}&pageSize=20`);
  check(list, {
    "products 200": (r) => r.status === 200,
    "cache header present": (r) => r.headers["X-Cache"] !== undefined,
  });
  cacheTotal.add(1);
  if (list.headers["X-Cache"] === "HIT") cacheHits.add(1);

  // 2. Featured strip (cached)
  const featured = http.get(`${BASE}/products/featured`);
  check(featured, { "featured 200": (r) => r.status === 200 });

  // 3. Categories (cached)
  const cats = http.get(`${BASE}/categories`);
  check(cats, { "categories 200": (r) => r.status === 200 });

  // 4. Search suggest (cached) — realistic autocomplete traffic
  const terms = ["battery", "display", "charger", "screen", "camera", "case"];
  const suggest = http.get(`${BASE}/search/suggest?q=${terms[vu % terms.length]}`);
  check(suggest, { "suggest 200": (r) => r.status === 200 });

  sleep(1);
}
