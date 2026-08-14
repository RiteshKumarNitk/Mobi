import 'dart:convert';

import 'package:http/http.dart' as http;

/// Thrown for any non-success API response.
class ApiException implements Exception {
  ApiException(this.message, this.code, this.status);
  final String message;
  final String code;
  final int status;

  @override
  String toString() => message;
}

/// Base URL override: `flutter run --dart-define=API_URL=http://localhost:4000/api`
/// Default targets the Android emulator's host loopback (10.0.2.2).
class ApiClient {
  ApiClient({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        baseUrl = baseUrl ??
            const String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000/api');

  final http.Client _client;
  final String baseUrl;

  String? token;
  String? deviceId;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null && token!.isNotEmpty) 'Authorization': 'Bearer $token',
        if (deviceId != null && deviceId!.isNotEmpty) 'x-device-id': deviceId!,
      };

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) => _send('POST', path, body);
  Future<dynamic> put(String path, [Map<String, dynamic>? body]) => _send('PUT', path, body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(String method, String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('$baseUrl$path');
    final req = http.Request(method, uri)..headers.addAll(_headers);
    if (body != null) req.body = jsonEncode(body);
    final streamed = await _client.send(req);
    final res = await http.Response.fromStream(streamed);

    dynamic decoded;
    try {
      decoded = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {
      decoded = null;
    }

    final ok = res.statusCode < 400 && (decoded is Map ? decoded['success'] == true : true);
    if (!ok) {
      final err = decoded is Map && decoded['error'] is Map ? decoded['error'] as Map : null;
      throw ApiException(
        err?['message']?.toString() ?? 'Request failed (${res.statusCode})',
        err?['code']?.toString() ?? 'ERROR',
        res.statusCode,
      );
    }
    return decoded is Map ? decoded['data'] : decoded;
  }
}
