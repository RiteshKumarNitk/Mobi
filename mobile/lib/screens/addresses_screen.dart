import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models.dart';
import '../state/app_state.dart';
import 'address_form_screen.dart';

class AddressesScreen extends StatefulWidget {
  const AddressesScreen({super.key});

  @override
  State<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends State<AddressesScreen> {
  List<Address> _addresses = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api;
    try {
      final data = await api.get('/customers/addresses') as List;
      if (!mounted) return;
      setState(() {
        _addresses = data.map((a) => Address.fromJson(a as Map<String, dynamic>)).toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(Address a) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete address?'),
        content: Text('${a.summary} will be removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!mounted) return;
    try {
      await context.read<AppState>().api.delete('/customers/addresses/${a.id}');
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Addresses')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final added = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const AddressFormScreen()));
          if (added == true) _load();
        },
        icon: const Icon(Icons.add),
        label: const Text('Add address'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _addresses.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.location_off_outlined, size: 52, color: Colors.grey),
                      SizedBox(height: 10),
                      Text('No addresses saved', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      SizedBox(height: 4),
                      Text('Add your shop or delivery address', style: TextStyle(color: Colors.grey, fontSize: 13)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: _addresses.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final a = _addresses[i];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(color: const Color(0xFFE8F0FB), borderRadius: BorderRadius.circular(4)),
                                    child: Text(a.addressType.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF0056B3))),
                                  ),
                                  if (a.isDefault) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(color: const Color(0xFFE8F5E9), borderRadius: BorderRadius.circular(4)),
                                      child: const Text('DEFAULT', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF28A745))),
                                    ),
                                  ],
                                  const Spacer(),
                                  IconButton(
                                    visualDensity: VisualDensity.compact,
                                    icon: const Icon(Icons.edit_outlined, size: 18),
                                    onPressed: () async {
                                      final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => AddressFormScreen(existing: a)));
                                      if (changed == true) _load();
                                    },
                                  ),
                                  IconButton(
                                    visualDensity: VisualDensity.compact,
                                    icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red),
                                    onPressed: () => _delete(a),
                                  ),
                                ],
                              ),
                              Text('${a.fullName} · ${a.phone}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                              const SizedBox(height: 4),
                              Text(a.summary, style: const TextStyle(fontSize: 12.5, color: Colors.grey)),
                              if (!a.isDefault) ...[
                                const SizedBox(height: 8),
                                TextButton(
                                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
                                  onPressed: () async {
                                    try {
                                      await context.read<AppState>().api.put('/customers/addresses/${a.id}/default');
                                      await _load();
                                    } on ApiException catch (e) {
                                      if (!context.mounted) return;
                                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                                    }
                                  },
                                  child: const Text('Set as default'),
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
