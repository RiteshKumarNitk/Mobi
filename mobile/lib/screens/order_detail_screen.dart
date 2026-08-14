import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../models.dart';
import '../state/app_state.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  OrderDetail? _order;
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api;
    try {
      final data = await api.get('/orders/${widget.orderId}') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _order = OrderDetail.fromJson(data);
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel order?'),
        content: const Text('This will cancel your order and restore stock. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep order')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Cancel order')),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<AppState>().api.post('/orders/${widget.orderId}/cancel');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Order cancelled')));
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reorder() async {
    if (!mounted) return;
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    setState(() => _busy = true);
    try {
      await state.api.post('/orders/${widget.orderId}/reorder');
      await state.refreshCart();
      messenger.showSnackBar(const SnackBar(content: Text('Items added to your cart')));
      navigator.popUntil((r) => r.isFirst);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _invoice() async {
    try {
      final inv = await context.read<AppState>().api.get('/orders/${widget.orderId}/invoice') as Map<String, dynamic>;
      if (!mounted) return;
      showModalBottomSheet(
        context: context,
        showDragHandle: true,
        builder: (_) => SizedBox(
          height: 420,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Invoice ${inv['invoiceNumber']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 12),
              for (final item in (inv['items'] as List? ?? []))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Expanded(child: Text('${item['productName']} × ${item['quantity']}', style: const TextStyle(fontSize: 12.5))),
                      Text(money((item['price'] as num).toDouble() * (item['quantity'] as int)), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              const Divider(height: 20),
              Row(children: [const Text('Subtotal', style: TextStyle(fontSize: 13, color: Colors.grey)), const Spacer(), Text(money((inv['subtotal'] as num).toDouble()))]),
              if ((inv['discountAmount'] as num? ?? 0) > 0)
                Row(children: [const Text('Discount', style: TextStyle(fontSize: 13, color: accent)), const Spacer(), Text('-${money((inv['discountAmount'] as num).toDouble())}', style: const TextStyle(color: accent))]),
              Row(children: [const Text('Shipping', style: TextStyle(fontSize: 13, color: Colors.grey)), const Spacer(), Text(money((inv['shippingCharge'] as num).toDouble()))]),
              const Divider(height: 20),
              Row(children: [const Text('Total', style: TextStyle(fontWeight: FontWeight.w800)), const Spacer(), Text(money((inv['totalAmount'] as num).toDouble()), style: const TextStyle(fontWeight: FontWeight.w800, color: primary))]),
              const SizedBox(height: 12),
              Text('GSTIN: ${inv['sellerGstin'] ?? '—'}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
              const Text('In a real deployment this invoice would be downloadable as PDF.', style: TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _order;
    return Scaffold(
      appBar: AppBar(title: Text(o == null ? 'Order' : '#${o.orderNumber}')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Row(
                    children: [
                      _statusChip(o!.status),
                      const Spacer(),
                      Text(_fmtDate(o.createdAt), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text('Payment: ${o.paymentStatus.toUpperCase()} · ${o.paymentMethod.toUpperCase()}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  const SizedBox(height: 16),
                  const Text('Items', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Card(
                    child: Column(
                      children: [
                        for (final line in o.items)
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(line.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                      Text('SKU: ${line.sku} · Qty: ${line.quantity}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                    ],
                                  ),
                                ),
                                Text(money(line.total), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                        const Divider(height: 8),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
                          child: Column(
                            children: [
                              Row(children: [const Text('Subtotal', style: TextStyle(fontSize: 12.5, color: Colors.grey)), const Spacer(), Text(money(o.subtotal), style: const TextStyle(fontSize: 12.5))]),
                              if (o.discountAmount > 0) Row(children: [const Text('Discount', style: TextStyle(fontSize: 12.5, color: accent)), const Spacer(), Text('-${money(o.discountAmount)}', style: const TextStyle(fontSize: 12.5, color: accent))]),
                              Row(children: [const Text('Shipping', style: TextStyle(fontSize: 12.5, color: Colors.grey)), const Spacer(), Text(o.shippingCharge > 0 ? money(o.shippingCharge) : 'Free', style: const TextStyle(fontSize: 12.5))]),
                              const SizedBox(height: 4),
                              Row(children: [const Text('Total', style: TextStyle(fontWeight: FontWeight.w800)), const Spacer(), Text(money(o.totalAmount), style: const TextStyle(fontWeight: FontWeight.w800, color: primary, fontSize: 15))]),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (o.shippingAddress != null) ...[
                    const SizedBox(height: 16),
                    const Text('Delivery Address', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${o.shippingAddress!.fullName} · ${o.shippingAddress!.phone}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                            const SizedBox(height: 4),
                            Text(o.shippingAddress!.summary, style: const TextStyle(fontSize: 12.5, color: Colors.grey)),
                          ],
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  const Text('Order Timeline', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  if (o.timeline.isEmpty)
                    const Card(child: Padding(padding: EdgeInsets.all(14), child: Text('No status updates yet', style: TextStyle(color: Colors.grey, fontSize: 13))))
                  else
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          children: [
                            for (var i = 0; i < o.timeline.length; i++) ...[
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Column(
                                    children: [
                                      Icon(Icons.circle, size: 10, color: i == 0 ? primary : accent),
                                      if (i != o.timeline.length - 1) Container(width: 2, height: 30, color: const Color(0xFFE4E7EB)),
                                    ],
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Padding(
                                      padding: EdgeInsets.only(bottom: i == o.timeline.length - 1 ? 0 : 14),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(_prettyStatus(o.timeline[i].status), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                          if (o.timeline[i].notes != null) Text(o.timeline[i].notes!, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                          if (o.timeline[i].at != null) Text(_fmtDateTime(o.timeline[i].at!), style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : _invoice,
                          icon: const Icon(Icons.receipt_long, size: 18),
                          label: const Text('Invoice'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : _reorder,
                          icon: const Icon(Icons.repeat, size: 18),
                          label: const Text('Reorder'),
                        ),
                      ),
                    ],
                  ),
                  if (o.status == 'pending' || o.status == 'processing') ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.tonalIcon(
                        onPressed: _busy ? null : _cancel,
                        icon: const Icon(Icons.cancel_outlined, size: 18),
                        label: const Text('Cancel order'),
                        style: FilledButton.styleFrom(foregroundColor: Colors.red),
                      ),
                    ),
                  ],
                ],
              ),
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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(status.toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color)),
    );
  }

  String _prettyStatus(String s) => s.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');

  String _fmtDate(DateTime d) => '${d.day.toString().padLeft(2, '0')} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]} ${d.year}';
  String _fmtDateTime(DateTime d) => '${_fmtDate(d)} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}
