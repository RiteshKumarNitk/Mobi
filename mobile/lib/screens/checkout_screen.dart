import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../models.dart';
import '../state/app_state.dart';
import 'address_form_screen.dart';
import 'auth/login_screen.dart';
import 'order_detail_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  List<Address> _addresses = [];
  String? _selectedAddressId;
  String _shippingMethod = 'standard';
  String _paymentMethod = 'cod';
  bool _loading = true;
  bool _placing = false;

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
    final api = state.api;
    try {
      final data = await api.get('/customers/addresses') as List;
      if (!mounted) return;
      setState(() {
        _addresses = data.map((a) => Address.fromJson(a as Map<String, dynamic>)).toList();
        _selectedAddressId ??= _addresses.isEmpty ? null : (_addresses.firstWhere((a) => a.isDefault, orElse: () => _addresses.first)).id;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _placeOrder() async {
    if (_selectedAddressId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please add a delivery address')));
      return;
    }
    final state = context.read<AppState>();
    setState(() => _placing = true);
    try {
      final res = await state.api.post('/orders/create', {
        'addressId': _selectedAddressId,
        'paymentMethod': _paymentMethod,
        'shippingMethod': _shippingMethod,
      }) as Map<String, dynamic>;

      final order = res['order'] as Map<String, dynamic>;
      final orderId = order['id'].toString();
      final orderNumber = order['orderNumber'].toString();

      if (_paymentMethod == 'razorpay' && res['mockPayment'] == true) {
        final rzp = res['razorpayOrder'] as Map<String, dynamic>? ?? {};
        await state.api.post('/payments/verify', {
          'orderId': orderId,
          'razorpayOrderId': rzp['id']?.toString() ?? 'mock_order',
          'razorpayPaymentId': 'mock_payment_$orderNumber',
          'razorpaySignature': 'mock_signature',
        });
      }

      if (!mounted) return;
      await state.refreshCart();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Order $orderNumber placed!')));
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: orderId)),
        (route) => route.isFirst,
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.lock_outline, size: 56, color: Colors.grey),
              const SizedBox(height: 10),
              const Text('Login to checkout', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              FilledButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())), child: const Text('Login')),
            ],
          ),
        ),
      );
    }
    final cart = state.cart;

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _sectionTitle('1 · Delivery Address', Icons.location_on_outlined),
                if (_addresses.isEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          const Text('No saved addresses', style: TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          FilledButton(
                            onPressed: () async {
                              final added = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const AddressFormScreen()));
                              if (added == true) _load();
                            },
                            child: const Text('Add address'),
                          ),
                        ],
                      ),
                    ),
                  )
                else ...[
                  RadioGroup<String>(
                    groupValue: _selectedAddressId,
                    onChanged: (v) => setState(() => _selectedAddressId = v),
                    child: Column(
                      children: [
                        for (final a in _addresses)
                          Card(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                        side: BorderSide(color: _selectedAddressId == a.id ? primary : const Color(0xFFE4E7EB), width: _selectedAddressId == a.id ? 1.5 : 1),
                      ),
                          child: RadioListTile<String>(
                            value: a.id,
                        title: Text('${a.fullName} · ${a.phone}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                            subtitle: Text('${a.summary}${a.isDefault ? '\n(DEFAULT)' : ''}', style: const TextStyle(fontSize: 12)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () async {
                      final added = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const AddressFormScreen()));
                      if (added == true) _load();
                    },
                    icon: const Icon(Icons.add),
                    label: const Text('Add new address'),
                  ),
                ],
                const SizedBox(height: 8),
                _sectionTitle('2 · Shipping Method', Icons.local_shipping_outlined),
                RadioGroup<String>(
                  groupValue: _shippingMethod,
                  onChanged: (v) => setState(() => _shippingMethod = v ?? _shippingMethod),
                  child: Card(
                    child: Column(
                      children: [
                        RadioListTile<String>(
                          value: 'standard',
                          title: const Text('Standard delivery', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                          subtitle: Text('2–4 days · ${cart.shipping > 0 ? money(cart.shipping) : 'Free'}', style: const TextStyle(fontSize: 12)),
                        ),
                        const RadioListTile<String>(
                          value: 'express',
                          title: Text('Express delivery', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                          subtitle: Text('1–2 days · Charges apply at dispatch', style: TextStyle(fontSize: 12)),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                _sectionTitle('3 · Payment Method', Icons.payment_outlined),
                RadioGroup<String>(
                  groupValue: _paymentMethod,
                  onChanged: (v) => setState(() => _paymentMethod = v ?? _paymentMethod),
                  child: const Card(
                    child: Column(
                      children: [
                        RadioListTile<String>(
                          value: 'cod',
                          title: Text('Cash on Delivery', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                          subtitle: Text('Pay when your order arrives', style: TextStyle(fontSize: 12)),
                        ),
                        RadioListTile<String>(
                          value: 'razorpay',
                          title: Text('Pay Online (UPI / Card / Net Banking)', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                          subtitle: Text('Secure payments via Razorpay · demo mode', style: TextStyle(fontSize: 12)),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                _sectionTitle('Order Summary', Icons.receipt_long_outlined),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      children: [
                        for (final line in cart.items)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Row(
                              children: [
                                Expanded(child: Text('${line.quantity}× ${line.product.name}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5))),
                                Text(money(line.product.price * line.quantity), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ),
                        const Divider(height: 16),
                        _summaryRow('Subtotal', money(cart.subtotal)),
                        if (cart.discount > 0) _summaryRow('Discount', '-${money(cart.discount)}', color: accent),
                        _summaryRow('Shipping', cart.shipping > 0 ? money(cart.shipping) : 'Free'),
                        const Divider(height: 16),
                        Row(
                          children: [
                            const Text('Total', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                            const Spacer(),
                            Text(money(cart.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: primary)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: (_placing || cart.items.isEmpty) ? null : _placeOrder,
                  style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 15)),
                  child: _placing
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(cart.items.isEmpty ? 'Cart is empty' : 'Place Order · ${money(cart.total)}'),
                ),
              ],
            ),
    );
  }

  Widget _sectionTitle(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: primary),
          const SizedBox(width: 6),
          Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  Widget _summaryRow(String label, String value, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(label, style: const TextStyle(fontSize: 12.5, color: Colors.grey)),
          const Spacer(),
          Text(value, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}
