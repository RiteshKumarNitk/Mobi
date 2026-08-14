import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models.dart';
import '../state/app_state.dart';
import 'products_screen.dart';

class BrandsScreen extends StatefulWidget {
  const BrandsScreen({super.key});

  @override
  State<BrandsScreen> createState() => _BrandsScreenState();
}

class _BrandsScreenState extends State<BrandsScreen> {
  List<Brand> _brands = [];
  bool _loading = true;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api;
    try {
      final data = await api.get('/brands') as List;
      if (!mounted) return;
      setState(() {
        _brands = data.map((b) => Brand.fromJson(b as Map<String, dynamic>)).toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  List<Brand> get _visible => _query.isEmpty ? _brands : _brands.where((b) => b.name.toLowerCase().contains(_query.toLowerCase())).toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Brands')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: TextField(
                    onChanged: (v) => setState(() => _query = v),
                    decoration: const InputDecoration(hintText: 'Search brands…', prefixIcon: Icon(Icons.search), filled: true, fillColor: Colors.white),
                  ),
                ),
                Expanded(
                  child: GridView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.95),
                    itemCount: _visible.length,
                    itemBuilder: (_, i) {
                      final b = _visible[i];
                      return InkWell(
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProductsScreen(brandId: b.id, title: b.name))),
                        child: Card(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              CircleAvatar(
                                radius: 24,
                                backgroundColor: const Color(0xFFE8F0FB),
                                child: Text(b.name.substring(0, 1), style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF0056B3), fontSize: 18)),
                              ),
                              const SizedBox(height: 8),
                              Text(b.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                              if (b.productCount != null) Text('${b.productCount} items', style: const TextStyle(fontSize: 10, color: Colors.grey)),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
    );
  }
}
