import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../state/app_state.dart';

class TrackScreen extends StatefulWidget {
  const TrackScreen({super.key});

  @override
  State<TrackScreen> createState() => _TrackScreenState();
}

class _TrackScreenState extends State<TrackScreen> {
  final _ctrl = TextEditingController();
  Map<String, dynamic>? _result;
  bool _loading = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _track() async {
    final n = _ctrl.text.trim();
    if (n.isEmpty) return;
    setState(() {
      _loading = true;
      _result = null;
    });
    try {
      final data = await context.read<AppState>().api.get('/orders/track/$n') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _result = data;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final timeline = (_result?['timeline'] as List? ?? []).cast<Map<String, dynamic>>();
    return Scaffold(
      appBar: AppBar(title: const Text('Track Order')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Enter your order number to track it without logging in.', style: TextStyle(fontSize: 13, color: Colors.grey)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  decoration: const InputDecoration(hintText: 'e.g. BC-2026-0001'),
                  textCapitalization: TextCapitalization.characters,
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(onPressed: _loading ? null : _track, child: _loading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Track')),
            ],
          ),
          if (_result != null) ...[
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('#${_result!['orderNumber']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(color: const Color(0xFFE8F0FB), borderRadius: BorderRadius.circular(20)),
                          child: Text(_result!['status'].toString().toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF0056B3))),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    for (var i = 0; i < timeline.length; i++) ...[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Column(
                            children: [
                              Icon(Icons.circle, size: 10, color: i == 0 ? const Color(0xFF0056B3) : accent),
                              if (i != timeline.length - 1) Container(width: 2, height: 30, color: const Color(0xFFE4E7EB)),
                            ],
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Padding(
                              padding: EdgeInsets.only(bottom: i == timeline.length - 1 ? 0 : 12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text((timeline[i]['status'] as String? ?? '').split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' '), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                  if (timeline[i]['notes'] != null) Text(timeline[i]['notes'].toString(), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                  if (timeline[i]['at'] != null)
                                    Text(_fmt(DateTime.tryParse(timeline[i]['at'].toString())), style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _fmt(DateTime? d) {
    if (d == null) return '';
    final local = d.toLocal();
    return '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year} · ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}
