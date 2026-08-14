import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models.dart';
import '../screens/auth/login_screen.dart';
import '../screens/product_detail_screen.dart';
import '../state/app_state.dart';
import '../main.dart';

class ProductTile extends StatelessWidget {
  const ProductTile({super.key, required this.product, this.horizontal = false});

  final Product product;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final inWishlist = state.wishlist.contains(product.id);
    final image = product.image != null
        ? Image.network(product.image!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const ColoredBox(color: Color(0xFFEEF2F7), child: Icon(Icons.image, color: Colors.grey)))
        : const ColoredBox(color: Color(0xFFEEF2F7), child: Icon(Icons.image, color: Colors.grey));

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProductDetailScreen(productId: product.id))),
        child: horizontal
            ? Row(
                children: [
                  SizedBox(width: 96, height: 96, child: Stack(fit: StackFit.expand, children: [image])),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: _info(context, state, inWishlist),
                    ),
                  ),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        image,
                        if (product.isNew)
                          Positioned(top: 6, left: 6, child: Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(4)), child: const Text('NEW', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)))),
                        if (product.discountPct > 0 && !product.isNew)
                          Positioned(top: 6, left: 6, child: Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(4)), child: Text('-${product.discountPct}%', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)))),
                        Positioned(
                          top: 4,
                          right: 4,
                          child: IconButton(
                            visualDensity: VisualDensity.compact,
                            icon: Icon(inWishlist ? Icons.favorite : Icons.favorite_border, color: inWishlist ? Colors.red : Colors.grey),
                            onPressed: () async {
                              try {
                                await state.toggleWishlist(product.id);
                              } on ApiException {
                                if (!context.mounted) return;
                                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(10),
                    child: _info(context, state, inWishlist),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _info(BuildContext context, AppState state, bool inWishlist) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (product.brandName != null) Text(product.brandName!.toUpperCase(), style: const TextStyle(fontSize: 10, color: Colors.grey, letterSpacing: 0.5)),
        Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Row(
          children: [
            Text(money(product.price), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: primary)),
            if (product.mrp != null) ...[
              const SizedBox(width: 6),
              Text(money(product.mrp!), style: const TextStyle(fontSize: 11, color: Colors.grey, decoration: TextDecoration.lineThrough)),
            ],
          ],
        ),
        Text(
          product.inStock ? (product.stockQuantity < 10 ? 'Only ${product.stockQuantity} left' : 'In stock') : 'Out of stock',
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: product.inStock ? accent : Colors.red),
        ),
      ],
    );
  }
}
