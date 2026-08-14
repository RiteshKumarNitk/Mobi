import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _email = true;
  bool _sms = true;
  bool _push = true;
  String _theme = 'light';
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<AppState>().api.get('/customers/settings') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _email = data['notificationEmail'] as bool? ?? true;
        _sms = data['notificationSms'] as bool? ?? true;
        _push = data['notificationPush'] as bool? ?? true;
        _theme = data['theme']?.toString() ?? 'light';
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _save({bool? email, bool? sms, bool? push, String? theme}) async {
    setState(() => _saving = true);
    try {
      await context.read<AppState>().api.put('/customers/settings', {
        if (email != null) 'notificationEmail': email,
        if (sms != null) 'notificationSms': sms,
        if (push != null) 'notificationPush': push,
        if (theme != null) 'theme': theme,
      });
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                const Text('Notifications', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                const SizedBox(height: 6),
                Card(
                  child: Column(
                    children: [
                      SwitchListTile(
                        title: const Text('Push notifications', style: TextStyle(fontSize: 13.5)),
                        subtitle: const Text('Order updates & offers', style: TextStyle(fontSize: 11.5)),
                        value: _push,
                        onChanged: _saving ? null : (v) {
                          setState(() => _push = v);
                          _save(push: v);
                        },
                      ),
                      SwitchListTile(
                        title: const Text('Email notifications', style: TextStyle(fontSize: 13.5)),
                        value: _email,
                        onChanged: _saving ? null : (v) {
                          setState(() => _email = v);
                          _save(email: v);
                        },
                      ),
                      SwitchListTile(
                        title: const Text('SMS notifications', style: TextStyle(fontSize: 13.5)),
                        value: _sms,
                        onChanged: _saving ? null : (v) {
                          setState(() => _sms = v);
                          _save(sms: v);
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const Text('Appearance', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                const SizedBox(height: 6),
                Card(
                  child: ListTile(
                    title: const Text('Theme', style: TextStyle(fontSize: 13.5)),
                    subtitle: const Text('Light mode is the default for now', style: TextStyle(fontSize: 11.5)),
                    trailing: DropdownButton<String>(
                      value: _theme,
                      underline: const SizedBox.shrink(),
                      items: const [
                        DropdownMenuItem(value: 'light', child: Text('Light')),
                        DropdownMenuItem(value: 'dark', child: Text('Dark')),
                      ],
                      onChanged: _saving ? null : (v) {
                        if (v == null) return;
                        setState(() => _theme = v);
                        _save(theme: v);
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text('About', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                const SizedBox(height: 6),
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.info_outline),
                    title: Text('Baba Communication', style: TextStyle(fontSize: 13.5)),
                    subtitle: Text('Version 1.0.0 · B2B mobile spare parts', style: TextStyle(fontSize: 11.5)),
                  ),
                ),
              ],
            ),
    );
  }
}
