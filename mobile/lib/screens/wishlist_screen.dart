import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models.dart';
import '../state/app_state.dart';
import '../widgets/product_tile.dart';
import 'auth/login_screen.dart';

class WishlistScreen extends StatefulWidget {
  const WishlistScreen({super.key, required this.onNeedLogin});

  final VoidCallback onNeedLogin;

  @override
  State<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends State<WishlistScreen> {
  List<Product> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    if (state.user == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final data = await state.api.get('/wishlist') as List;
      if (!mounted) return;
      setState(() {
        _items = data.map((e) => Product.fromJson((e as Map)['product'] as Map<String, dynamic>)).toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.user == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.favorite_border, size: 56, color: Colors.grey),
            const SizedBox(height: 10),
            const Text('Login to view your wishlist', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())), child: const Text('Login')),
          ],
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Wishlist'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.favorite_border, size: 56, color: Colors.grey),
                      SizedBox(height: 10),
                      Text('Your wishlist is empty', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      SizedBox(height: 4),
                      Text('Tap the heart on any product to save it here', style: TextStyle(color: Colors.grey, fontSize: 13)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final p = _items[i];
                      return Card(
                        child: Row(
                          children: [
                            Expanded(child: SizedBox(height: 110, child: ProductTile(product: p, horizontal: true))),
                            IconButton(
                              tooltip: 'Remove',
                              icon: const Icon(Icons.favorite, color: Colors.red),
                              onPressed: () async {
                                try {
                                  await state.toggleWishlist(p.id);
                                  _load();
                                } on ApiException catch (e) {
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                                }
                              },
                            ),
                            IconButton(
                              tooltip: 'Move to cart',
                              icon: const Icon(Icons.add_shopping_cart),
                              onPressed: () async {
                                try {
                                  await state.moveWishlistToCart(p.id);
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Moved to cart')));
                                  _load();
                                } on ApiException catch (e) {
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                                }
                              },
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
