import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// The website URL the app renders. The website is the single source of truth
/// (auth, catalog, cart, checkout...) — the app is a full-screen in-app browser.
///
/// Default targets the Android emulator's host loopback. For a real device or a
/// deployed site, pass your own at build time:
///   flutter run --dart-define=APP_URL=https://your-store.example.com
const String kAppUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'http://10.0.2.2:3000',
);

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key, this.url = kAppUrl});

  final String url;

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  double _progress = 0;
  String? _error;
  String _currentUrl = '';

  @override
  void initState() {
    super.initState();
    _currentUrl = widget.url;
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) => setState(() => _progress = p / 100),
          onPageStarted: (url) => setState(() {
            _loading = true;
            _error = null;
            _currentUrl = url;
          }),
          onPageFinished: (_) => setState(() => _loading = false),
          onWebResourceError: (e) => setState(() => _error = e.description),
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  Future<void> _reload() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      await _controller.reload();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else {
          if (context.mounted) Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Baba Communication'),
          actions: [
            IconButton(
              tooltip: 'Reload',
              icon: const Icon(Icons.refresh),
              onPressed: _loading ? null : _reload,
            ),
            IconButton(
              tooltip: 'Home',
              icon: const Icon(Icons.home_outlined),
              onPressed: () => _controller.loadRequest(Uri.parse(widget.url)),
            ),
          ],
        ),
        body: Stack(
          children: [
            Positioned.fill(
              child: WebViewWidget(controller: _controller),
            ),
            if (_loading)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: LinearProgressIndicator(
                  value: _progress == 0 ? null : _progress,
                  minHeight: 2,
                ),
              ),
            if (_error != null)
              Positioned.fill(
                child: Container(
                  color: const Color(0xFFF8F9FA),
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.wifi_off, size: 56, color: Colors.grey),
                          const SizedBox(height: 12),
                          const Text(
                            'Could not load the store',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '$_error\n\n$_currentUrl',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: _reload,
                            icon: const Icon(Icons.refresh),
                            label: const Text('Try again'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
