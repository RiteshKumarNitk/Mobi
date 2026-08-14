import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../main.dart';
import '../../models.dart';
import '../../state/app_state.dart';
import '../home_screen.dart';
import 'forgot_password_screen.dart';
import 'otp_screen.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final phone = _phone.text.trim();
    final password = _password.text;
    if (phone.length < 10 || password.isEmpty) {
      setState(() => _error = 'Enter your phone number and password');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final state = context.read<AppState>();
    try {
      final data = await state.api.post('/auth/login', {'phone': phone, 'password': password}) as Map<String, dynamic>;
      await state.login(data['accessToken'].toString(), User.fromJson(data['user'] as Map<String, dynamic>));
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const HomeScreen()));
    } on ApiException catch (e) {
      if (e.code == 'OTP_REQUIRED') {
        // Phone not verified yet - verify via OTP
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => OtpScreen(phone: phone, purpose: 'login', debugCode: _extractDebug(e)),
        ));
      } else {
        setState(() => _error = e.message);
      }
    } catch (_) {
      setState(() => _error = 'Something went wrong. Please try again.');
    }
    setState(() => _busy = false);
  }

  String? _extractDebug(ApiException e) => null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Baba Communication', textAlign: TextAlign.center, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: primary)),
                  const Text('Login to your B2B account', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 14)),
                  const SizedBox(height: 28),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
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
                          TextField(
                            controller: _phone,
                            keyboardType: TextInputType.phone,
                            maxLength: 10,
                            decoration: const InputDecoration(labelText: 'Phone Number', prefixText: '+91 ', counterText: ''),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _password,
                            obscureText: _obscure,
                            decoration: InputDecoration(
                              labelText: 'Password',
                              suffixIcon: IconButton(
                                icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off, size: 20),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: accent, padding: const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: _busy ? null : _login,
                            child: _busy
                                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Text('Login', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          ),
                          TextButton(
                            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ForgotPasswordScreen())),
                            child: const Text('Forgot password?'),
                          ),
                          const Divider(height: 8),
                          const Text('New to Baba Communication?', textAlign: TextAlign.center, style: TextStyle(fontSize: 13)),
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen())),
                            child: const Text('Create an Account'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text('Demo: 8888888888 / Customer@123', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 12)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
