import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../models.dart';
import '../state/app_state.dart';
import '../widgets/product_tile.dart';
import 'auth/login_screen.dart';
import 'cart_screen.dart';
import 'categories_screen.dart';
import 'notifications_screen.dart';
import 'products_screen.dart';
import 'profile_screen.dart';
import 'wishlist_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final tabs = [
      const _HomeTab(),
      const CategoriesScreen(),
      WishlistScreen(onNeedLogin: () => _goLogin(context)),
      CartScreen(onNeedLogin: () => _goLogin(context)),
      const ProfileScreen(),
    ];
    return Scaffold(
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          const NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view), label: 'Categories'),
          NavigationDestination(
            icon: Badge(label: Text('${state.wishlist.length}'), isLabelVisible: state.wishlist.isNotEmpty, child: const Icon(Icons.favorite_border)),
            selectedIcon: Badge(label: Text('${state.wishlist.length}'), isLabelVisible: state.wishlist.isNotEmpty, child: const Icon(Icons.favorite)),
            label: 'Wishlist',
          ),
          NavigationDestination(
            icon: Badge(label: Text('${state.cart.items.fold<int>(0, (s, l) => s + l.quantity)}'), isLabelVisible: state.cart.items.isNotEmpty, child: const Icon(Icons.shopping_cart_outlined)),
            selectedIcon: Badge(label: Text('${state.cart.items.fold<int>(0, (s, l) => s + l.quantity)}'), isLabelVisible: state.cart.items.isNotEmpty, child: const Icon(Icons.shopping_cart)),
            label: 'Cart',
          ),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  void _goLogin(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
  }
}

class _HomeTab extends StatefulWidget {
  const _HomeTab();

  @override
  State<_HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<_HomeTab> {
  final _search = TextEditingController();
  List<dynamic> _banners = [];
  List<Category> _categories = [];
  List<Product> _featured = [];
  List<Product> _trending = [];
  List<Product> _newArrivals = [];
  List<dynamic> _offers = [];
  bool _loading = true;
  final PageController _pageController = PageController();
  int _slide = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api;
    try {
      final results = await Future.wait([
        api.get('/banners/active'),
        api.get('/categories'),
        api.get('/products/featured'),
        api.get('/products/trending'),
        api.get('/products/new'),
        api.get('/offers'),
      ]);
      if (!mounted) return;
      setState(() {
        _banners = (results[0] as List).where((b) => b['type'] == 'homepage').toList();
        _categories = (results[1] as List).map((c) => Category.fromJson(c as Map<String, dynamic>)).where((c) => c.name.isNotEmpty).toList();
        _featured = (results[2] as List).map((p) => Product.fromJson(p as Map<String, dynamic>)).toList();
        _trending = (results[3] as List).map((p) => Product.fromJson(p as Map<String, dynamic>)).toList();
        _newArrivals = (results[4] as List).map((p) => Product.fromJson(p as Map<String, dynamic>)).toList();
        _offers = (results[5] as Map)['banners'] as List? ?? [];
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _loading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not load: ${e.message}')));
      }
    }
  }

  @override
  void dispose() {
    _search.dispose();
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Baba Communication', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () => _goSearch(context, _search.text)),
          IconButton(icon: const Icon(Icons.notifications_none), onPressed: () => _goNotifications(context)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: TextField(
                      controller: _search,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (v) => _goSearch(context, v),
                      decoration: InputDecoration(
                        hintText: 'Search by product, SKU or brand…',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: () => _goSearch(context, _search.text)),
                        filled: true,
                        fillColor: Colors.white,
                      ),
                    ),
                  ),
                  if (_banners.isNotEmpty) _bannerCarousel(),
                  _sectionTitle('Shop by Category', () => _goCategories(context)),
                  _categoryChips(),
                  _productRow('Featured Products', _featured),
                  _productRow('Trending Now', _trending),
                  _productRow('New Arrivals', _newArrivals),
                  if (_offers.isNotEmpty) _offerStrip(),
                  const SizedBox(height: 16),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Card(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Why Baba Communication?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                            SizedBox(height: 8),
                            Text('• Fast dispatch within 24 hours\n• B2B wholesale pricing\n• Quality-tested parts\n• 6 month warranty on displays & batteries', style: TextStyle(color: Colors.grey, fontSize: 13)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _bannerCarousel() {
    return SizedBox(
      height: 160,
      child: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            onPageChanged: (i) => setState(() => _slide = i),
            itemCount: _banners.length,
            itemBuilder: (_, i) {
              final b = _banners[i] as Map<String, dynamic>;
              return GestureDetector(
                onTap: () => _openLink(b['linkUrl']?.toString()),
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [primary, Color(0xFF007BFF)]),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(b['title']?.toString() ?? '', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                      if (b['subtitle'] != null) ...[
                        const SizedBox(height: 4),
                        Text(b['subtitle'].toString(), style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
          Positioned(
            bottom: 8,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_banners.length, (i) => AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: i == _slide ? 18 : 8,
                height: 8,
                decoration: BoxDecoration(color: i == _slide ? Colors.white : Colors.white54, borderRadius: BorderRadius.circular(4)),
              )),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title, VoidCallback? onMore) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 8, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          if (onMore != null)
            TextButton(onPressed: onMore, child: const Text('View all →')),
        ],
      ),
    );
  }

  Widget _categoryChips() {
    return SizedBox(
      height: 74,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final c = _categories[i];
          return GestureDetector(
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => ProductsScreen(categoryId: c.id, title: c.name),
            )),
            child: Column(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE4E7EB))),
                  alignment: Alignment.center,
                  child: Text(c.name.substring(0, 1), style: const TextStyle(fontWeight: FontWeight.w800, color: primary, fontSize: 18)),
                ),
                const SizedBox(height: 4),
                SizedBox(width: 76, child: Text(c.name, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11))),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _productRow(String title, List<Product> products) {
    if (products.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle(title, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProductsScreen()))),
        SizedBox(
          height: 250,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => SizedBox(width: 160, child: ProductTile(product: products[i])),
          ),
        ),
      ],
    );
  }

  Widget _offerStrip() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Special Offers', () => _goOffers(context)),
        SizedBox(
          height: 110,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _offers.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) {
              final o = _offers[i] as Map<String, dynamic>;
              return Container(
                width: 280,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFFFFC107), Color(0xFFFFD54F)]),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(o['title']?.toString() ?? 'Offer', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    if (o['subtitle'] != null) Text(o['subtitle'].toString(), style: const TextStyle(fontSize: 12)),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  void _goSearch(BuildContext context, String q) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProductsScreen(searchQuery: q.trim())));
  }

  void _goCategories(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CategoriesScreen()));
  }

  void _goNotifications(BuildContext context) {
    final state = context.read<AppState>();
    if (state.user == null) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen()));
  }

  void _goOffers(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProductsScreen()));
  }

  void _openLink(String? url) {
    // For demo: navigate to products when a link is set, else ignore
    if (url == null || url.isEmpty) return;
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProductsScreen()));
  }
}

