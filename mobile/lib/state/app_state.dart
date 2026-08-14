import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../models.dart';

class AppState extends ChangeNotifier {
  AppState(this.api);

  final ApiClient api;

  User? user;
  bool initialized = false;
  bool cartLoading = false;

  CartData cart = CartData();
  Set<String> wishlist = {};

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    api.deviceId = prefs.getString('device_id') ?? _newDeviceId(prefs);
    final savedToken = prefs.getString('token');
    if (savedToken != null && savedToken.isNotEmpty) {
      api.token = savedToken;
      try {
        final me = await api.get('/auth/me') as Map<String, dynamic>;
        user = User.fromJson(me['user'] as Map<String, dynamic>);
        await refreshWishlist();
      } catch (_) {
        api.token = null;
        await prefs.remove('token');
      }
    }
    await refreshCart();
    initialized = true;
    notifyListeners();
  }

  String _newDeviceId(SharedPreferences prefs) {
    final id = DateTime.now().microsecondsSinceEpoch.toString();
    prefs.setString('device_id', id);
    return id;
  }

  Future<void> login(String token, User u) async {
    api.token = token;
    user = u;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', token);
    await refreshWishlist();
    await refreshCart();
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    api.token = null;
    user = null;
    wishlist = {};
    cart = CartData();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    notifyListeners();
  }

  Future<void> refreshCart() async {
    cartLoading = true;
    notifyListeners();
    try {
      cart = CartData.fromJson(await api.get('/cart') as Map<String, dynamic>);
    } catch (_) {
      cart = CartData();
    }
    cartLoading = false;
    notifyListeners();
  }

  Future<void> addToCart(String productId, {int qty = 1}) async {
    await api.post('/cart/add', {'productId': productId, 'quantity': qty});
    await refreshCart();
  }

  Future<void> updateCartQty(String itemId, int quantity) async {
    await api.put('/cart/update', {'itemId': itemId, 'quantity': quantity});
    await refreshCart();
  }

  Future<void> removeCartItem(String itemId) async {
    await api.delete('/cart/remove?itemId=$itemId');
    await refreshCart();
  }

  Future<void> saveForLater(String itemId, bool saved) async {
    await api.post('/cart/save-for-later', {'itemId': itemId, 'saved': saved});
    await refreshCart();
  }

  Future<void> applyCoupon(String code) async {
    await api.post('/cart/apply-coupon', {'code': code});
    await refreshCart();
  }

  Future<void> removeCoupon() async {
    await api.delete('/cart/remove-coupon');
    await refreshCart();
  }

  Future<void> refreshWishlist() async {
    if (api.token == null) return;
    try {
      final data = await api.get('/wishlist') as List;
      wishlist = data.map((e) => (e as Map)['product']['id'].toString()).toSet();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toggleWishlist(String productId) async {
    if (api.token == null) throw ApiException('Login to use wishlist', 'LOGIN_REQUIRED', 401);
    if (wishlist.contains(productId)) {
      await api.delete('/wishlist/remove?productId=$productId');
      wishlist.remove(productId);
    } else {
      await api.post('/wishlist/add', {'productId': productId});
      wishlist.add(productId);
    }
    notifyListeners();
  }

  Future<void> moveWishlistToCart(String productId) async {
    await api.post('/wishlist/move-to-cart', {'productId': productId});
    wishlist.remove(productId);
    await refreshCart();
    notifyListeners();
  }
}
