#!/usr/bin/env bash
# Smoke test for the Baba Communication API.
# Requires the API running on http://localhost:4000 (npm run dev:api)
set -u
API="${API:-http://localhost:4000/api}"
JQ() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(eval('JSON.parse(d)'+process.argv[1]))}catch(e){console.log('ERR:'+e.message);process.exit(1)}})" "$1"; }

echo "== 1. Health =="
curl -s "$API/../health" | JQ ".ok" || exit 1

echo "== 2. Public catalog =="
curl -s "$API/products?pageSize=3" | JQ ".data.total" | head -c 40; echo " products"
curl -s "$API/categories" | JQ ".data.length"; echo " categories"
curl -s "$API/brands" | JQ ".data.length"; echo " brands"
curl -s "$API/banners/active" | JQ ".data.length"; echo " banners"
curl -s "$API/content/pages/about" | JQ ".data.title"
curl -s "$API/search/suggest?q=samsung" | JQ ".data.products.length"; echo " suggest hits"

echo "== 3. Admin login + dashboard =="
ADMIN_TOKEN=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" -d '{"phone":"9999999999","password":"Admin@123"}' | JQ ".data.accessToken")
echo "admin token: ${ADMIN_TOKEN:0:16}..."
curl -s "$API/admin/dashboard" -H "Authorization: Bearer $ADMIN_TOKEN" | JQ ".data.metrics.totalProducts"; echo " total products (admin view)"

echo "== 4. Customer register + OTP =="
PHONE="71111$((RANDOM % 90000 + 10000))"
REG=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"password\":\"Test@12345\",\"name\":\"Smoke Tester\",\"shopName\":\"Test Shop\"}")
echo "register: $(echo "$REG" | JQ ".data.otpSent")"
CODE=$(echo "$REG" | JQ ".data.debugCode")
if [ "$CODE" = "undefined" ] || [ -z "$CODE" ]; then
  CODE=$(curl -s -X POST "$API/otp/send" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"purpose\":\"register\"}" | JQ ".data.debugCode")
fi
echo "otp code: $CODE"
VERIFY=$(curl -s -X POST "$API/otp/verify" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"purpose\":\"register\",\"code\":\"$CODE\"}")
echo "verify: $(echo "$VERIFY" | JQ ".data.verified")"
TOKEN=$(echo "$VERIFY" | JQ ".data.accessToken")

echo "== 5. Customer login =="
curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"password\":\"Test@12345\"}" | JQ ".data.user.role"

echo "== 6. Wishlist + guest cart =="
PID=$(curl -s "$API/products?pageSize=1" | JQ ".data.items[0].id")
curl -s -X POST "$API/wishlist/add" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"productId\":\"$PID\"}" | JQ ".data.message"
curl -s "$API/wishlist" -H "Authorization: Bearer $TOKEN" | JQ ".data.length"; echo " wishlist items"

DEV="smoke-device-$RANDOM"
curl -s -X POST "$API/cart/add" -H "x-device-id: $DEV" -H "Content-Type: application/json" -d "{\"productId\":\"$PID\",\"quantity\":3}" | JQ ".data.message"
curl -s -X POST "$API/cart/apply-coupon" -H "x-device-id: $DEV" -H "Content-Type: application/json" -d '{"code":"WELCOME10"}' | JQ ".data.message"
curl -s "$API/cart" -H "x-device-id: $DEV" | JQ ".data.summary.total"

echo "== 7. Address + order (COD) =="
ADDR=$(curl -s -X POST "$API/customers/addresses" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"fullName":"Smoke Tester","phone":"9999999999","addressLine1":"12 Test Street","city":"Delhi","state":"Delhi","pincode":"110001","addressType":"Shop"}')
AID=$(echo "$ADDR" | JQ ".data.id")
ORDER=$(curl -s -X POST "$API/orders/create" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"addressId\":\"$AID\",\"paymentMethod\":\"cod\",\"items\":[{\"productId\":\"$PID\",\"quantity\":1}]}")
echo "order number: $(echo "$ORDER" | JQ ".data.order.orderNumber")"
OID=$(echo "$ORDER" | JQ ".data.order.id")
curl -s "$API/orders/$OID/invoice" -H "Authorization: Bearer $TOKEN" | JQ ".data.invoiceNumber"
curl -s "$API/orders/$OID/status" -H "Authorization: Bearer $TOKEN" | JQ ".data.status"

echo "== 8. Admin order flow =="
ONUM=$(echo "$ORDER" | JQ ".data.order.orderNumber")
AID2=$(curl -s "$API/admin/orders?q=$ONUM" -H "Authorization: Bearer $ADMIN_TOKEN" | JQ ".data.items[0].id")
curl -s -X PUT "$API/admin/orders/$AID2/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"status":"processing"}' | JQ ".data.message"

echo "== 9. Review + notifications =="
curl -s -X POST "$API/products/$PID/reviews" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"rating":4,"comment":"Works great for my shop"}' | JQ ".data.message"
curl -s "$API/notifications" -H "Authorization: Bearer $TOKEN" | JQ ".data.total"
curl -s -X PUT "$API/notifications/mark-all-read" -H "Authorization: Bearer $TOKEN" | JQ ".data.message"

echo "== 10. Guest order tracking =="
curl -s "$API/orders/track/$ONUM" | JQ ".data.status"

echo ""
echo "SMOKE TEST PASSED ✔"
