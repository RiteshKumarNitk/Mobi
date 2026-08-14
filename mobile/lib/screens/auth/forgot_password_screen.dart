import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../state/app_state.dart';
import 'otp_screen.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _gotOtp = false;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final state = context.read<AppState>();
    try {
      final data = await state.api
          .post('/auth/forgot-password', {'phone': _phone.text.trim()}) as Map<String, dynamic>;
      if (!mounted) return;
      final verifiedCode = await Navigator.of(context).push<String>(
        MaterialPageRoute(
          builder: (_) => OtpScreen(
            phone: _phone.text.trim(),
            purpose: 'password_reset',
            debugCode: data['debugCode']?.toString(),
          ),
        ),
      );
      if (verifiedCode != null) {
        _verifiedCode = verifiedCode;
        setState(() => _gotOtp = true);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Could not send OTP');
    }
    setState(() => _busy = false);
  }

  String? _verifiedCode;

  Future<void> _reset() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final state = context.read<AppState>();
    try {
      await state.api.post('/auth/reset-password', {
        'phone': _phone.text.trim(),
        'code': _verifiedCode,
        'newPassword': _password.text,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated. Please login.')));
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
    setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reset Password')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: const Color(0xFFFDEAEC), borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: const TextStyle(color: Color(0xFFA71D2A))),
              ),
              const SizedBox(height: 12),
            ],
            TextField(controller: _phone, keyboardType: TextInputType.phone, maxLength: 10, decoration: const InputDecoration(labelText: 'Registered Phone', prefixText: '+91 ', counterText: '')),
            const SizedBox(height: 12),
            if (!_gotOtp)
              FilledButton(
                onPressed: _busy ? null : _sendOtp,
                child: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Send OTP'),
              )
            else ...[
              TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New Password'),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _reset,
                child: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Reset Password'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
