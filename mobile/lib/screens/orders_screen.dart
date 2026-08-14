import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../models.dart';
import '../state/app_state.dart';
import 'order_detail_screen.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final List<OrderSummary> _orders = [];
  String _tab = 'All';
  bool _loading = true;

  static const _tabs = ['All', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api;
    try {
      final data = await api.get('/orders?pageSize=100') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _orders
          ..clear()
          ..addAll((data['items'] as List).map((o) => OrderSummary.fromJson(o as Map<String, dynamic>)));
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  List<OrderSummary> get _visible {
    if (_tab == 'All') return _orders;
    final t = _tab.toLowerCase();
    return _orders.where((o) {
      if (t == 'processing') return o.status == 'pending' || o.status == 'processing' || o.status == 'packed';
      return o.status == t;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Orders')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                SizedBox(
                  height: 46,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    children: _tabs
                        .map((t) => Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              child: ChoiceChip(
                                label: Text(t),
                                selected: _tab == t,
                                onSelected: (_) => setState(() => _tab = t),
                              ),
                            ))
                        .toList(),
                  ),
                ),
                Expanded(
                  child: _visible.isEmpty
                      ? const Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.receipt_long, size: 52, color: Colors.grey),
                              SizedBox(height: 10),
                              Text('No orders yet', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                              SizedBox(height: 4),
                              Text('Your placed orders will appear here', style: TextStyle(color: Colors.grey, fontSize: 13)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(12),
                            itemCount: _visible.length,
                            itemBuilder: (_, i) {
                              final o = _visible[i];
                              return Card(
                                child: InkWell(
                                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: o.id))),
                                  child: Padding(
                                    padding: const EdgeInsets.all(14),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Text('#${o.orderNumber}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                                            const Spacer(),
                                            _statusChip(o.status),
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        if (o.firstItemName != null)
                                          Text('${o.itemsCount} item${o.itemsCount == 1 ? '' : 's'} · ${o.firstItemName}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: Colors.grey)),
                                        const SizedBox(height: 6),
                                        Row(
                                          children: [
                                            Text(_fmtDate(o.createdAt), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                            const Spacer(),
                                            Text(money(o.totalAmount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: primary)),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                ),
              ],
            ),
    );
  }

  Widget _statusChip(String status) {
    final color = switch (status) {
      'delivered' => accent,
      'cancelled' => Colors.red,
      'shipped' => const Color(0xFF007BFF),
      _ => const Color(0xFFF59E0B),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(status.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color)),
    );
  }

  String _fmtDate(DateTime d) => '${d.day.toString().padLeft(2, '0')} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]} ${d.year}';
}
