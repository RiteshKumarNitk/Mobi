import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:baba_comm/api/api_client.dart';
import 'package:baba_comm/models.dart';
import 'package:baba_comm/screens/auth/login_screen.dart';
import 'package:baba_comm/screens/auth/otp_screen.dart';
import 'package:baba_comm/screens/auth/register_screen.dart';
import 'package:baba_comm/screens/splash_screen.dart';
import 'package:baba_comm/state/app_state.dart';

/// Stub API client that answers the cart read (called by AppState init) and
/// errors on everything else.
ApiClient stubApi() => ApiClient(
      baseUrl: 'http://test/api',
      client: MockClient((req) async {
        if (req.url.path == '/cart') {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'items': [],
                'savedForLater': [],
                'summary': {'subtotal': 0, 'discount': 0, 'shipping': 0, 'total': 0},
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({'success': false, 'error': {'message': 'Not found', 'code': 'NOT_FOUND'}}),
          404,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

Widget wrap(Widget child) {
  return ChangeNotifierProvider.value(value: AppState(stubApi()), child: MaterialApp(home: child));
}

void main() {
  test('money formats rupees without trailing zeros', () {
    expect(money(100), '₹100');
    expect(money(100.5), '₹100.50');
    expect(money(1234.56), '₹1234.56');
    expect(money(0), '₹0');
    expect(moneyFull(100), '₹100.00');
  });

  test('discount percentage computes from price vs mrp', () {
    final p = Product(id: '1', name: 'Screen', sku: 'S1', price: 800, mrp: 1000);
    expect(p.discountPct, 20);
    final noMrp = Product(id: '2', name: 'Battery', sku: 'B1', price: 500);
    expect(noMrp.discountPct, 0);
    final out = Product(id: '3', name: 'X', sku: 'X1', price: 10, stockQuantity: 0);
    expect(out.inStock, isFalse);
  });

  testWidgets('splash shows brand then hands off to the in-app browser', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: SplashScreen(builder: _stubLanding)),
    );
    expect(find.text('Baba Communication'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.text('LANDED'), findsOneWidget);
  });

  testWidgets('login screen shows phone, password and demo hint', (tester) async {
    await tester.pumpWidget(wrap(const LoginScreen()));
    expect(find.text('Phone Number'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.textContaining('Demo:'), findsOneWidget);
  });

  testWidgets('register validates mismatched passwords', (tester) async {
    await tester.pumpWidget(wrap(const RegisterScreen()));
    await tester.enterText(find.widgetWithText(TextField, 'Password *'), 'secret1');
    await tester.enterText(find.widgetWithText(TextField, 'Confirm *'), 'secret2');
    await tester.tap(find.text('Register & Get OTP'));
    await tester.pump();
    expect(find.text('Passwords do not match'), findsOneWidget);
  });

  testWidgets('otp screen shows dev code and resend countdown', (tester) async {
    await tester.pumpWidget(wrap(const OtpScreen(phone: '9999999999', purpose: 'register', debugCode: '123456')));
    expect(find.textContaining('123456'), findsOneWidget);
    expect(find.textContaining('Resend OTP in'), findsOneWidget);
    // dispose the screen so the countdown timer is cancelled
    await tester.pumpWidget(const SizedBox());
  });
}

Widget _stubLanding(BuildContext context) => const Scaffold(body: Center(child: Text('LANDED')));
