import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../state/app_state.dart';
import 'otp_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _shop = TextEditingController();
  final _gst = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _agree = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _shop, _gst, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _register() async {
    if (_password.text.length < 6) return setState(() => _error = 'Password must be at least 6 characters');
    if (_password.text != _confirm.text) return setState(() => _error = 'Passwords do not match');
    if (!_agree) return setState(() => _error = 'Please accept the Terms & Conditions');
    setState(() {
      _busy = true;
      _error = null;
    });
    final state = context.read<AppState>();
    try {
      final data = await state.api.post('/auth/register', {
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'password': _password.text,
        if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
        if (_shop.text.trim().isNotEmpty) 'shopName': _shop.text.trim(),
        if (_gst.text.trim().isNotEmpty) 'gstNumber': _gst.text.trim(),
      }) as Map<String, dynamic>;
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => OtpScreen(
          phone: _phone.text.trim(),
          purpose: 'register',
          debugCode: data['debugCode']?.toString(),
        ),
      ));
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Registration failed. Please try again.');
    }
    setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: const Color(0xFFFDEAEC), borderRadius: BorderRadius.circular(8)),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFA71D2A), fontSize: 13)),
                  ),
                  const SizedBox(height: 12),
                ],
                TextField(controller: _name, decoration: const InputDecoration(labelText: 'Full Name *')),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        maxLength: 10,
                        decoration: const InputDecoration(labelText: 'Phone *', prefixText: '+91 ', counterText: ''),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: TextField(controller: _shop, decoration: const InputDecoration(labelText: 'Shop Name'))),
                    const SizedBox(width: 12),
                    Expanded(child: TextField(controller: _gst, decoration: const InputDecoration(labelText: 'GST Number'))),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password *')),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(controller: _confirm, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm *')),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Checkbox(value: _agree, onChanged: (v) => setState(() => _agree = v ?? false)),
                    const Expanded(child: Text('I agree to the Terms & Conditions', style: TextStyle(fontSize: 13))),
                  ],
                ),
                const SizedBox(height: 8),
                FilledButton(
                  style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                  onPressed: _busy ? null : _register,
                  child: _busy
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Register & Get OTP', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
