import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../main.dart';
import '../../models.dart';
import '../../state/app_state.dart';
import '../home_screen.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.phone, required this.purpose, this.debugCode, this.onSuccess});

  final String phone;
  final String purpose; // register | login | password_reset
  final String? debugCode;
  final VoidCallback? onSuccess;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _controller = TextEditingController();
  Timer? _timer;
  int _secondsLeft = 60;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _secondsLeft = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_secondsLeft <= 1) {
        t.cancel();
        setState(() => _secondsLeft = 0);
      } else {
        setState(() => _secondsLeft--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _controller.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit OTP');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final state = context.read<AppState>();
    try {
      final data = await state.api
          .post('/otp/verify', {'phone': widget.phone, 'purpose': widget.purpose, 'code': code}) as Map<String, dynamic>;
      if (widget.purpose == 'password_reset') {
        if (!mounted) return;
        Navigator.of(context).pop(code); // return the verified code to the caller
        return;
      }
      final token = data['accessToken']?.toString();
      if (token != null) {
        await state.login(token, User.fromJson(data['user'] as Map<String, dynamic>));
      }
      if (!mounted) return;
      widget.onSuccess?.call();
      Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const HomeScreen()), (r) => false);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Verification failed. Please try again.');
    }
    setState(() => _busy = false);
  }

  Future<void> _resend() async {
    if (_secondsLeft > 0) return;
    setState(() => _error = null);
    final state = context.read<AppState>();
    try {
      final data = await state.api.post('/otp/send', {'phone': widget.phone, 'purpose': widget.purpose}) as Map<String, dynamic>;
      _startTimer();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('OTP sent${data['debugCode'] != null ? ': ${data['debugCode']}' : ''}')));
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify OTP')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.sms_outlined, size: 56, color: primary),
            const SizedBox(height: 12),
            const Text('We sent a 6-digit code', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text('to +91 ${widget.phone}. It expires in 5 minutes.', textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey)),
            if (widget.debugCode != null && widget.debugCode!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: const Color(0xFFFFF3CD), borderRadius: BorderRadius.circular(8)),
                child: Text('Dev mode: your OTP is ${widget.debugCode}', textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF856404))),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFA71D2A))),
            ],
            const SizedBox(height: 20),
            TextField(
              controller: _controller,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 26, letterSpacing: 10, fontWeight: FontWeight.w700),
              decoration: const InputDecoration(hintText: '••••••'),
              onSubmitted: (_) => _verify(),
            ),
            const SizedBox(height: 20),
            FilledButton(
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              onPressed: _busy ? null : _verify,
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Verify', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 14),
            TextButton(
              onPressed: _secondsLeft > 0 ? null : _resend,
              child: Text(_secondsLeft > 0 ? 'Resend OTP in ${_secondsLeft}s' : 'Resend OTP'),
            ),
          ],
        ),
      ),
    );
  }
}
