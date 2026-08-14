import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models.dart';
import '../state/app_state.dart';

class AddressFormScreen extends StatefulWidget {
  const AddressFormScreen({super.key, this.existing});

  final Address? existing;

  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _fullName;
  late final TextEditingController _phone;
  late final TextEditingController _line1;
  late final TextEditingController _line2;
  late final TextEditingController _city;
  late final TextEditingController _state;
  late final TextEditingController _pincode;
  String _type = 'Shop';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _fullName = TextEditingController(text: e?.fullName ?? '');
    _phone = TextEditingController(text: e?.phone ?? '');
    _line1 = TextEditingController(text: e?.addressLine1 ?? '');
    _line2 = TextEditingController(text: e?.addressLine2 ?? '');
    _city = TextEditingController(text: e?.city ?? '');
    _state = TextEditingController(text: e?.state ?? '');
    _pincode = TextEditingController(text: e?.pincode ?? '');
    _type = e?.addressType ?? 'Shop';
  }

  @override
  void dispose() {
    _fullName.dispose();
    _phone.dispose();
    _line1.dispose();
    _line2.dispose();
    _city.dispose();
    _state.dispose();
    _pincode.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final api = context.read<AppState>().api;
    final body = {
      'fullName': _fullName.text.trim(),
      'phone': _phone.text.trim(),
      'addressLine1': _line1.text.trim(),
      if (_line2.text.trim().isNotEmpty) 'addressLine2': _line2.text.trim(),
      'city': _city.text.trim(),
      'state': _state.text.trim(),
      'pincode': _pincode.text.trim(),
      'addressType': _type,
    };
    try {
      if (widget.existing == null) {
        await api.post('/customers/addresses', body);
      } else {
        await api.put('/customers/addresses/${widget.existing!.id}', body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.existing == null ? 'Add Address' : 'Edit Address')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _fullName,
              decoration: const InputDecoration(labelText: 'Full name'),
              validator: (v) => (v == null || v.trim().length < 2) ? 'Enter full name' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone number'),
              validator: (v) => (v == null || !RegExp(r'^[0-9]{10,15}$').hasMatch(v)) ? 'Enter a valid phone' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _line1,
              decoration: const InputDecoration(labelText: 'Address line 1'),
              validator: (v) => (v == null || v.trim().length < 3) ? 'Enter address' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _line2,
              decoration: const InputDecoration(labelText: 'Address line 2 (optional)'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _city,
                    decoration: const InputDecoration(labelText: 'City'),
                    validator: (v) => (v == null || v.trim().length < 2) ? 'Required' : null,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _state,
                    decoration: const InputDecoration(labelText: 'State'),
                    validator: (v) => (v == null || v.trim().length < 2) ? 'Required' : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _pincode,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Pincode'),
              validator: (v) => (v == null || !RegExp(r'^[0-9]{6}$').hasMatch(v)) ? '6-digit pincode' : null,
            ),
            const SizedBox(height: 12),
            const Text('Address type', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 6),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'Shop', label: Text('Shop')),
                ButtonSegment(value: 'Home', label: Text('Home')),
                ButtonSegment(value: 'Other', label: Text('Other')),
              ],
              selected: {_type},
              onSelectionChanged: (s) => setState(() => _type = s.first),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Save Address'),
            ),
          ],
        ),
      ),
    );
  }
}
