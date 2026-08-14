import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models.dart';
import '../state/app_state.dart';
import 'auth/login_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<NotificationItem> _items = [];
  int _unread = 0;
  bool _loading = true;

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
    try {
      final data = await state.api.get('/notifications?pageSize=50') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _items = (data['items'] as List).map((n) => NotificationItem.fromJson(n as Map<String, dynamic>)).toList();
        _unread = data['unread'] as int? ?? 0;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _markAll() async {
    try {
      await context.read<AppState>().api.put('/notifications/mark-all-read');
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _markRead(NotificationItem n) async {
    if (n.isRead) return;
    try {
      await context.read<AppState>().api.put('/notifications/${n.id}/read');
      _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Notifications')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.notifications_none, size: 56, color: Colors.grey),
              const SizedBox(height: 10),
              const Text('Login to see notifications', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              FilledButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())), child: const Text('Login')),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (_unread > 0)
            TextButton(
              onPressed: _markAll,
              child: const Text('Mark all read', style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.notifications_none, size: 56, color: Colors.grey),
                      SizedBox(height: 10),
                      Text('No notifications', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      SizedBox(height: 4),
                      Text('Order and payment updates will appear here', style: TextStyle(color: Colors.grey, fontSize: 13)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: _items.length,
                  itemBuilder: (_, i) {
                    final n = _items[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                        side: BorderSide(color: n.isRead ? const Color(0xFFE4E7EB) : const Color(0xFF0056B3), width: n.isRead ? 1 : 1.2),
                      ),
                      child: ListTile(
                        leading: Icon(_iconFor(n.type), color: n.isRead ? Colors.grey : const Color(0xFF0056B3)),
                        title: Text(n.title ?? 'Notification', style: TextStyle(fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w800, fontSize: 13.5)),
                        subtitle: Text('${n.message}\n${_fmtDateTime(n.createdAt)}', style: const TextStyle(fontSize: 12)),
                        isThreeLine: true,
                        onTap: () => _markRead(n),
                      ),
                    );
                  },
                ),
    );
  }

  IconData _iconFor(String? type) => switch (type) {
        'order' => Icons.receipt_long,
        'payment' => Icons.payment,
        'promo' => Icons.local_offer,
        _ => Icons.notifications,
      };

  String _fmtDateTime(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}
