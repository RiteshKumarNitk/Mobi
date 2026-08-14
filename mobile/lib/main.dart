import 'package:flutter/material.dart';

import 'screens/splash_screen.dart';

const primary = Color(0xFF0056B3);
const accent = Color(0xFF28A745);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BabaApp());
}

/// The app is an in-app browser: it renders the Baba Communication website,
/// which is the single source of truth for the storefront (auth, catalog,
/// cart, checkout). The website is maintained once and works everywhere.
class BabaApp extends StatelessWidget {
  const BabaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Baba Communication',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: primary,
          primary: primary,
          secondary: accent,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF8F9FA),
        appBarTheme: const AppBarTheme(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          centerTitle: false,
        ),
      ),
      home: const SplashScreen(),
    );
  }
}
