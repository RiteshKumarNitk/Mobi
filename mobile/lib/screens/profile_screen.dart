import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'addresses_screen.dart';
import 'auth/login_screen.dart';
import 'brands_screen.dart';
import 'notifications_screen.dart';
import 'orders_screen.dart';
import 'settings_screen.dart';
import 'track_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final user = state.user;

    return Scaffold(
      appBar: AppBar(title: const Text('My Account')),
      body: user == null
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.person_outline, size: 56, color: Colors.grey),
                  const SizedBox(height: 10),
                  const Text('You are not logged in', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  const Text('Login to order faster and track your purchases', style: TextStyle(color: Colors.grey, fontSize: 13)),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())), child: const Text('Login / Register')),
                ],
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 28,
                          backgroundColor: const Color(0xFFE8F0FB),
                          child: Text((user.name ?? user.phone).substring(0, 1).toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF0056B3), fontSize: 22)),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(user.name ?? 'Baba Customer', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                              if (user.shopName != null) Text(user.shopName!, style: const TextStyle(fontSize: 13, color: Colors.grey)),
                              Text(user.phone, style: const TextStyle(fontSize: 13, color: Colors.grey)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                _tile(context, Icons.receipt_long_outlined, 'My Orders', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const OrdersScreen()))),
                _tile(context, Icons.location_on_outlined, 'Addresses', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AddressesScreen()))),
                _tile(context, Icons.notifications_none, 'Notifications', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen()))),
                _tile(context, Icons.settings_outlined, 'Settings', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()))),
                _tile(context, Icons.local_shipping_outlined, 'Track Order (guest)', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TrackScreen()))),
                _tile(context, Icons.branding_watermark_outlined, 'Shop by Brand', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BrandsScreen()))),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () async {
                    await state.logout();
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Logged out')));
                    }
                  },
                  icon: const Icon(Icons.logout, size: 18, color: Colors.red),
                  label: const Text('Logout', style: TextStyle(color: Colors.red)),
                ),
                const SizedBox(height: 16),
                const Center(child: Text('Baba Communication · v1.0.0', style: TextStyle(fontSize: 11, color: Colors.grey))),
              ],
            ),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String title, VoidCallback onTap) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: Icon(icon, color: const Color(0xFF0056B3)),
        title: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        trailing: const Icon(Icons.chevron_right, color: Colors.grey),
        onTap: onTap,
      ),
    );
  }
}
