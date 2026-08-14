import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models.dart';
import '../state/app_state.dart';
import '../widgets/product_tile.dart';

class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key, this.categoryId, this.brandId, this.searchQuery, this.title});

  final String? categoryId;
  final String? brandId;
  final String? searchQuery;
  final String? title;

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  final List<Product> _items = [];
  int _page = 1;
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;

  final List<String> _brands = [];
  final List<String> _cats = [];
  String? _selectedBrand;
  String? _selectedCat;
  String _sort = 'newest';
  bool _inStockOnly = false;
  double _maxPrice = 5000;
  final double _maxPriceLimit = 5000;
  bool _grid = true;
  bool _showFilters = false;

  @override
  void initState() {
    super.initState();
    _maxPrice = _maxPriceLimit;
    _load();
  }

  Future<void> _load({bool reset = true}) async {
    if (reset) {
      setState(() {
        _loading = true;
        _items.clear();
        _page = 1;
      });
    } else {
      setState(() => _loadingMore = true);
    }
    final api = context.read<AppState>().api;
    final q = <String, String>{
      if (widget.categoryId != null) 'categoryId': widget.categoryId!,
      if (_selectedBrand != null) 'brandId': _selectedBrand!,
      if (_selectedCat != null) 'categoryId': _selectedCat!,
      if (widget.searchQuery != null && widget.searchQuery!.isNotEmpty) 'q': widget.searchQuery!,
      'sort': _sort,
      if (_inStockOnly) 'stock': 'in',
      'minPrice': '0',
      'maxPrice': _maxPrice.toString(),
      'page': _page.toString(),
      'pageSize': '20',
    };
    try {
      final data = await api.get('/products?${Uri(queryParameters: q).query}') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _items.addAll((data['items'] as List).map((p) => Product.fromJson(p as Map<String, dynamic>)));
        _total = data['total'] as int? ?? 0;
        _loading = false;
        _loadingMore = false;
      });
      if (_brands.isEmpty || _cats.isEmpty) await _loadFacets();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _loadFacets() async {
    final api = context.read<AppState>().api;
    try {
      final results = await Future.wait([api.get('/brands'), api.get('/categories')]);
      if (!mounted) return;
      setState(() {
        _brands
          ..clear()
          ..addAll((results[0] as List).map((b) => (b as Map)['name'].toString()));
        _cats
          ..clear()
          ..addAll((results[1] as List).map((c) => (c as Map)['name'].toString()));
      });
    } catch (_) {}
  }

  bool get _hasMore => _items.length < _total;

  @override
  Widget build(BuildContext context) {
    final title = widget.title ??
        (widget.searchQuery != null && widget.searchQuery!.isNotEmpty ? 'Search: ${widget.searchQuery}' : 'Products');
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(icon: const Icon(Icons.tune), onPressed: () => setState(() => _showFilters = !_showFilters)),
          IconButton(icon: Icon(_grid ? Icons.view_list : Icons.grid_view), onPressed: () => setState(() => _grid = !_grid)),
        ],
      ),
      body: Column(
        children: [
          if (_showFilters) _filterPanel(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(
              children: [
                Text('$_total products', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                const Spacer(),
                DropdownButton<String>(
                  value: _sort,
                  underline: const SizedBox.shrink(),
                  isDense: true,
                  items: const [
                    DropdownMenuItem(value: 'newest', child: Text('Newest')),
                    DropdownMenuItem(value: 'price_asc', child: Text('Price: Low to High')),
                    DropdownMenuItem(value: 'price_desc', child: Text('Price: High to Low')),
                    DropdownMenuItem(value: 'best_selling', child: Text('Best Selling')),
                    DropdownMenuItem(value: 'name_asc', child: Text('Name A–Z')),
                    DropdownMenuItem(value: 'name_desc', child: Text('Name Z–A')),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() => _sort = v);
                    _load();
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _items.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.search_off, size: 48, color: Colors.grey),
                            const SizedBox(height: 8),
                            const Text('No products found', style: TextStyle(fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            const Text('Try adjusting your filters', style: TextStyle(color: Colors.grey, fontSize: 12)),
                            TextButton(onPressed: _resetFilters, child: const Text('Clear filters')),
                          ],
                        ),
                      )
                    : NotificationListener<ScrollNotification>(
                        onNotification: (n) {
                          if (n.metrics.pixels > n.metrics.maxScrollExtent - 400 && !_loadingMore && _hasMore) {
                            _page += 1;
                            _load(reset: false);
                          }
                          return false;
                        },
                        child: _grid
                            ? GridView.builder(
                                padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.62),
                                itemCount: _items.length + (_hasMore ? 1 : 0),
                                itemBuilder: (_, i) {
                                  if (i >= _items.length) return const Center(child: CircularProgressIndicator());
                                  return ProductTile(product: _items[i]);
                                },
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                                itemCount: _items.length + (_hasMore ? 1 : 0),
                                itemBuilder: (_, i) {
                                  if (i >= _items.length) return const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator()));
                                  return Padding(padding: const EdgeInsets.only(bottom: 8), child: ProductTile(product: _items[i], horizontal: true));
                                },
                              ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _filterPanel() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Filters', style: TextStyle(fontWeight: FontWeight.w800)),
              const Spacer(),
              TextButton(onPressed: _resetFilters, child: const Text('Reset')),
            ],
          ),
          if (widget.brandId == null) ...[
            const Text('Brand', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
            Wrap(
              spacing: 8,
              children: _brands
                  .map((b) => FilterChip(
                        label: Text(b),
                        selected: _selectedBrand == b,
                        onSelected: (_) => setState(() {
                          _selectedBrand = _selectedBrand == b ? null : b;
                        }),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 8),
          ],
          const Text('Category', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          Wrap(
            spacing: 8,
            children: _cats
                .map((c) => FilterChip(
                      label: Text(c),
                      selected: _selectedCat == c,
                      onSelected: (_) => setState(() {
                        _selectedCat = _selectedCat == c ? null : c;
                      }),
                    ))
                .toList(),
          ),
          const SizedBox(height: 8),
          Text('Max price: ${money(_maxPrice)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          Slider(
            value: _maxPrice,
            min: 0,
            max: _maxPriceLimit,
            divisions: 50,
            label: money(_maxPrice),
            onChanged: (v) => setState(() => _maxPrice = v),
          ),
          SwitchListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: const Text('In stock only', style: TextStyle(fontSize: 13)),
            value: _inStockOnly,
            onChanged: (v) => setState(() => _inStockOnly = v),
          ),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _load, child: const Text('Apply filters')),
          ),
        ],
      ),
    );
  }

  void _resetFilters() {
    setState(() {
      _selectedBrand = null;
      _selectedCat = null;
      _inStockOnly = false;
      _maxPrice = _maxPriceLimit;
    });
    _load();
  }
}
