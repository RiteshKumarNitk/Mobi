import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../models.dart';
import '../state/app_state.dart';
import '../widgets/product_tile.dart';
import 'auth/login_screen.dart';

class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  Product? _product;
  List<Map<String, dynamic>> _gallery = [];
  List<dynamic> _reviews = [];
  double _avgRating = 0;
  int _reviewCount = 0;
  List<Product> _related = [];
  bool _loading = true;
  int _qty = 1;
  int _imageIndex = 0;
  bool _adding = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api;
    try {
      final results = await Future.wait([
        api.get('/products/${widget.productId}'),
        api.get('/products/${widget.productId}/reviews'),
        api.get('/products/${widget.productId}/related'),
      ]);
      if (!mounted) return;
      final p = results[0] as Map<String, dynamic>;
      final rv = results[1] as Map<String, dynamic>;
      setState(() {
        _product = Product.fromJson(p);
        _gallery = (p['gallery'] as List? ?? []).map((g) => (g as Map).cast<String, dynamic>()).toList();
        if (_gallery.isEmpty && p['image'] != null) _gallery = [{'url': p['image'].toString()}];
        _reviews = rv['reviews'] as List? ?? [];
        _avgRating = (rv['averageRating'] as num?)?.toDouble() ?? 0;
        _reviewCount = rv['total'] as int? ?? 0;
        _related = (results[2] as List).map((r) => Product.fromJson(r as Map<String, dynamic>)).toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _addToCart() async {
    final state = context.read<AppState>();
    setState(() => _adding = true);
    try {
      await state.addToCart(widget.productId, qty: _qty);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Added to cart')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _product;
    final state = context.watch<AppState>();
    final inWishlist = p != null && state.wishlist.contains(p.id);

    return Scaffold(
      appBar: AppBar(title: Text(p?.brandName?.toUpperCase() ?? 'Product')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                // Gallery
                SizedBox(
                  height: 280,
                  child: Stack(
                    children: [
                      PageView.builder(
                        itemCount: _gallery.length,
                        onPageChanged: (i) => setState(() => _imageIndex = i),
                        itemBuilder: (_, i) => Image.network(
                          _gallery[i]['url'].toString(),
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => const ColoredBox(color: Color(0xFFEEF2F7), child: Icon(Icons.image, size: 72, color: Colors.grey)),
                        ),
                      ),
                      if (_gallery.length > 1)
                        Positioned(
                          bottom: 10,
                          left: 0,
                          right: 0,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: List.generate(_gallery.length, (i) => AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              margin: const EdgeInsets.symmetric(horizontal: 3),
                              width: i == _imageIndex ? 16 : 7,
                              height: 7,
                              decoration: BoxDecoration(color: i == _imageIndex ? primary : const Color(0xFFCCD4DE), borderRadius: BorderRadius.circular(4)),
                            )),
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(p!.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                          ),
                          IconButton(
                            icon: Icon(inWishlist ? Icons.favorite : Icons.favorite_border, color: inWishlist ? Colors.red : Colors.grey),
                            onPressed: () async {
                              try {
                                await state.toggleWishlist(p.id);
                              } on ApiException {
                                if (!context.mounted) return;
                                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
                              }
                            },
                          ),
                        ],
                      ),
                      Text('SKU: ${p.sku}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(money(p.price), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: primary)),
                          if (p.mrp != null) ...[
                            const SizedBox(width: 8),
                            Text(money(p.mrp!), style: const TextStyle(fontSize: 14, color: Colors.grey, decoration: TextDecoration.lineThrough)),
                            const SizedBox(width: 6),
                            Text('${p.discountPct}% off', style: const TextStyle(fontSize: 12, color: accent, fontWeight: FontWeight.w700)),
                          ],
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(Icons.star, size: 16, color: Colors.amber),
                          Text(' ${_avgRating.toStringAsFixed(1)} ', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                          Text('($_reviewCount reviews)', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: p.inStock ? const Color(0xFFE8F5E9) : const Color(0xFFFDECEA),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          p.inStock ? 'In stock — ${p.stockQuantity} available' : 'Out of stock',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: p.inStock ? accent : Colors.red),
                        ),
                      ),
                      if (p.inStock) ...[
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Container(
                              decoration: BoxDecoration(border: Border.all(color: const Color(0xFFE4E7EB)), borderRadius: BorderRadius.circular(8)),
                              child: Row(
                                children: [
                                  IconButton(icon: const Icon(Icons.remove), onPressed: _qty > 1 ? () => setState(() => _qty--) : null),
                                  Text('$_qty', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                                  IconButton(icon: const Icon(Icons.add), onPressed: _qty < p.stockQuantity ? () => setState(() => _qty++) : null),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: _adding ? null : _addToCart,
                                icon: _adding ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.add_shopping_cart),
                                label: const Text('Add to Cart'),
                                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                              ),
                            ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 20),
                      if (p.description != null && p.description!.isNotEmpty) ...[
                        const Text('Description', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 6),
                        Text(p.description!, style: const TextStyle(fontSize: 13.5, height: 1.5, color: Color(0xFF444444))),
                        const SizedBox(height: 16),
                      ],
                      if (p.attributes.isNotEmpty) ...[
                        const Text('Technical Specifications', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        Card(
                          child: Column(
                            children: p.attributes
                                .map((a) => Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      child: Row(
                                        children: [
                                          Expanded(child: Text(a.key, style: const TextStyle(fontSize: 13, color: Colors.grey))),
                                          Expanded(flex: 2, child: Text(a.value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                                        ],
                                      ),
                                    ))
                                .toList(),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      if (_reviews.isNotEmpty) ...[
                        const Text('Customer Reviews', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        ..._reviews.take(5).map((r) => _reviewCard(r as Map<String, dynamic>)),
                        const SizedBox(height: 16),
                      ],
                    ],
                  ),
                ),
                if (_related.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
                    child: Text('Related Products', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  ),
                  SizedBox(
                    height: 250,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _related.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (_, i) => SizedBox(width: 160, child: ProductTile(product: _related[i])),
                    ),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _reviewCard(Map<String, dynamic> r) {
    final user = r['user'] as Map? ?? {};
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(radius: 14, backgroundColor: const Color(0xFFE8F0FB), child: Text((user['name']?.toString().substring(0, 1) ?? 'C'), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: primary))),
                const SizedBox(width: 8),
                Expanded(child: Text(user['name']?.toString() ?? 'Customer', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
                Row(
                  children: List.generate(5, (i) => Icon(Icons.star, size: 14, color: i < (r['rating'] as int? ?? 0) ? Colors.amber : const Color(0xFFE0E0E0))),
                ),
              ],
            ),
            if (r['title'] != null) ...[
              const SizedBox(height: 6),
              Text(r['title'].toString(), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            ],
            if (r['comment'] != null) ...[
              const SizedBox(height: 4),
              Text(r['comment'].toString(), style: const TextStyle(fontSize: 13, height: 1.4, color: Color(0xFF444444))),
            ],
          ],
        ),
      ),
    );
  }
}
