import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../models.dart';
import '../state/app_state.dart';
import 'checkout_screen.dart';
import 'products_screen.dart';
import 'auth/login_screen.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key, required this.onNeedLogin});

  final VoidCallback onNeedLogin;

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final _couponCtrl = TextEditingController();
  bool _applyingCoupon = false;

  @override
  void dispose() {
    _couponCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.user == null) return _loggedOut();
    final cart = state.cart;

    return Scaffold(
      appBar: AppBar(title: const Text('My Cart')),
      body: cart.items.isEmpty && cart.savedForLater.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.shopping_cart_outlined, size: 56, color: Colors.grey),
                  const SizedBox(height: 10),
                  const Text('Your cart is empty', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  const Text('Browse products and add items to get started', style: TextStyle(color: Colors.grey, fontSize: 13)),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProductsScreen())), child: const Text('Browse Products')),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: state.refreshCart,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 120),
                children: [
                  for (final line in cart.items) _cartLine(state, line),
                  if (cart.savedForLater.isNotEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                      child: Text('Saved for later', style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                    for (final line in cart.savedForLater) _cartLine(state, line, saved: true),
                  ],
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Apply coupon', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 8),
                        if (cart.couponCode != null)
                          Card(
                            child: ListTile(
                              dense: true,
                              title: Text(cart.couponCode!, style: const TextStyle(fontWeight: FontWeight.w800, color: accent)),
                              subtitle: Text('Discount: ${money(cart.discount)}'),
                              trailing: IconButton(
                                icon: const Icon(Icons.close),
                                onPressed: () async {
                                  try {
                                    await state.removeCoupon();
                                  } on ApiException catch (e) {
                                    if (!context.mounted) return;
                                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                                  }
                                },
                              ),
                            ),
                          )
                        else
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _couponCtrl,
                                  decoration: const InputDecoration(hintText: 'Enter coupon code'),
                                ),
                              ),
                              const SizedBox(width: 8),
                              FilledButton(
                                onPressed: _applyingCoupon
                                    ? null
                                    : () async {
                                        setState(() => _applyingCoupon = true);
                                        try {
                                          await state.applyCoupon(_couponCtrl.text.trim());
                                        } on ApiException catch (e) {
                                          if (!context.mounted) return;
                                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                                        } finally {
                                          if (mounted) setState(() => _applyingCoupon = false);
                                        }
                                      },
                                child: const Text('Apply'),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
      bottomNavigationBar: cart.items.isEmpty
          ? null
          : SafeArea(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        const Text('Total', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                        const Spacer(),
                        Text(money(cart.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: primary)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Text('Subtotal', style: TextStyle(fontSize: 12, color: Colors.grey)),
                        const Spacer(),
                        Text(money(cart.subtotal), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                    if (cart.discount > 0)
                      Row(
                        children: [
                          const Text('Discount', style: TextStyle(fontSize: 12, color: accent)),
                          const Spacer(),
                          Text('-${money(cart.discount)}', style: const TextStyle(fontSize: 12, color: accent)),
                        ],
                      ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CheckoutScreen())),
                        style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                        child: const Text('Proceed to Checkout'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _loggedOut() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.lock_outline, size: 56, color: Colors.grey),
          const SizedBox(height: 10),
          const Text('Login to view your cart', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          FilledButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())), child: const Text('Login')),
        ],
      ),
    );
  }

  Widget _cartLine(AppState state, CartLine line, {bool saved = false}) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 84,
            height: 84,
            child: line.product.image != null
                ? Image.network(line.product.image!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const ColoredBox(color: Color(0xFFEEF2F7), child: Icon(Icons.image, color: Colors.grey)))
                : const ColoredBox(color: Color(0xFFEEF2F7), child: Icon(Icons.image, color: Colors.grey)),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(line.product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(money(line.product.price), style: const TextStyle(fontWeight: FontWeight.w800, color: primary, fontSize: 13)),
                  const SizedBox(height: 4),
                  if (saved)
                    TextButton(
                      style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 30)),
                      onPressed: () async {
                        try {
                          await state.saveForLater(line.id, false);
                        } on ApiException catch (e) {
                          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                        }
                      },
                      child: const Text('Move to cart'),
                    )
                  else
                    Row(
                      children: [
                        Container(
                          decoration: BoxDecoration(border: Border.all(color: const Color(0xFFE4E7EB)), borderRadius: BorderRadius.circular(6)),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                visualDensity: VisualDensity.compact,
                                icon: const Icon(Icons.remove, size: 16),
                                onPressed: line.quantity > 1 ? () => state.updateCartQty(line.id, line.quantity - 1) : null,
                              ),
                              Text('${line.quantity}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                              IconButton(
                                visualDensity: VisualDensity.compact,
                                icon: const Icon(Icons.add, size: 16),
                                onPressed: () => state.updateCartQty(line.id, line.quantity + 1),
                              ),
                            ],
                          ),
                        ),
                        const Spacer(),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          icon: const Icon(Icons.delete_outline, size: 18),
                          onPressed: () => state.removeCartItem(line.id),
                        ),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          icon: const Icon(Icons.bookmark_border, size: 18),
                          onPressed: () => state.saveForLater(line.id, true),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
