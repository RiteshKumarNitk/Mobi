double _num(dynamic v) => (v is num) ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0;
String _str(dynamic v) => v?.toString() ?? '';
bool _bool(dynamic v) => v == true;

class User {
  User({required this.id, required this.phone, this.name, this.shopName, this.gstNumber, this.email, this.role});
  final String id;
  final String phone;
  final String? name;
  final String? shopName;
  final String? gstNumber;
  final String? email;
  final String? role;

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: _str(j['id']),
        phone: _str(j['phone']),
        name: '${_str(j['firstName'])} ${_str(j['lastName'])}'.trim(),
        shopName: j['shopName']?.toString(),
        gstNumber: j['gstNumber']?.toString(),
        email: j['email']?.toString(),
        role: _str(j['role']),
      );
}

class Brand {
  Brand({required this.id, required this.name});
  final String id;
  final String name;
  int? productCount;

  factory Brand.fromJson(Map<String, dynamic> j) => Brand(id: _str(j['id']), name: _str(j['name']))
    ..productCount = j['_count']?['products'] as int?;
}

class Category {
  Category({required this.id, required this.name, this.productCount});
  final String id;
  final String name;
  final int? productCount;
  List<Category> children = [];

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: _str(j['id']),
        name: _str(j['name']),
        productCount: j['_count']?['products'] as int?,
      )..children = (j['children'] as List? ?? []).map((c) => Category.fromJson(c as Map<String, dynamic>)).toList();
}

class Product {
  Product({
    required this.id,
    required this.name,
    required this.sku,
    required this.price,
    this.mrp,
    this.stockQuantity = 0,
    this.stockStatus = 'in_stock',
    this.image,
    this.brandName,
    this.categoryName,
    this.isNew = false,
    this.isFeatured = false,
    this.isBestSeller = false,
    this.description,
    this.attributes = const [],
    this.rating = 0,
    this.reviewCount = 0,
  });

  final String id;
  final String name;
  final String sku;
  final double price;
  final double? mrp;
  final int stockQuantity;
  final String stockStatus;
  final String? image;
  final String? brandName;
  final String? categoryName;
  final bool isNew;
  final bool isFeatured;
  final bool isBestSeller;
  final String? description;
  final List<MapEntry<String, String>> attributes;
  final double rating;
  final int reviewCount;

  bool get inStock => stockQuantity > 0;
  int get discountPct =>
      (mrp != null && mrp! > price) ? ((1 - price / mrp!) * 100).round() : 0;

  factory Product.fromJson(Map<String, dynamic> j) {
    final brand = j['brand'] as Map?;
    final category = j['category'] as Map?;
    final attrs = (j['attributes'] as List? ?? [])
        .map((a) => MapEntry(_str(a['name']), _str(a['value'])))
        .toList();
    return Product(
      id: _str(j['id']),
      name: _str(j['name']),
      sku: _str(j['sku']),
      price: _num(j['price']),
      mrp: j['mrp'] == null ? null : _num(j['mrp']),
      stockQuantity: j['stockQuantity'] as int? ?? 0,
      stockStatus: _str(j['stockStatus']),
      image: j['image']?.toString(),
      brandName: brand?['name']?.toString(),
      categoryName: category?['name']?.toString(),
      isNew: _bool(j['isNew']),
      isFeatured: _bool(j['isFeatured']),
      isBestSeller: _bool(j['isBestSeller']),
      description: j['description']?.toString(),
      attributes: attrs,
      rating: _num(j['rating']),
      reviewCount: j['reviewCount'] as int? ?? 0,
    );
  }
}

class CartLine {
  CartLine({required this.id, required this.quantity, required this.product});
  final String id;
  final int quantity;
  final Product product;
}

class CartData {
  CartData({
    this.items = const [],
    this.savedForLater = const [],
    this.couponCode,
    this.subtotal = 0,
    this.discount = 0,
    this.shipping = 0,
    this.total = 0,
  });

  final List<CartLine> items;
  final List<CartLine> savedForLater;
  final String? couponCode;
  final double subtotal;
  final double discount;
  final double shipping;
  final double total;

  factory CartData.fromJson(Map<String, dynamic> j) {
    List<CartLine> lines(List<dynamic>? raw) => (raw ?? [])
        .map((l) {
          final m = l as Map<String, dynamic>;
          return CartLine(
            id: _str(m['id']),
            quantity: m['quantity'] as int? ?? 1,
            product: Product.fromJson(m['product'] as Map<String, dynamic>),
          );
        })
        .toList();

    final summary = j['summary'] as Map? ?? {};
    final coupon = j['coupon'] as Map?;
    return CartData(
      items: lines(j['items'] as List?),
      savedForLater: lines(j['savedForLater'] as List?),
      couponCode: coupon?['code']?.toString(),
      subtotal: _num(summary['subtotal']),
      discount: _num(summary['discount']),
      shipping: _num(summary['shipping']),
      total: _num(summary['total']),
    );
  }
}

class Address {
  Address({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.addressLine1,
    this.addressLine2,
    required this.city,
    required this.state,
    required this.pincode,
    this.addressType = 'Shop',
    this.isDefault = false,
  });

  final String id;
  final String fullName;
  final String phone;
  final String addressLine1;
  final String? addressLine2;
  final String city;
  final String state;
  final String pincode;
  final String addressType;
  final bool isDefault;

  String get summary => '$addressLine1, $city, $state - $pincode';

  factory Address.fromJson(Map<String, dynamic> j) => Address(
        id: _str(j['id']),
        fullName: _str(j['fullName']),
        phone: _str(j['phone']),
        addressLine1: _str(j['addressLine1']),
        addressLine2: j['addressLine2']?.toString(),
        city: _str(j['city']),
        state: _str(j['state']),
        pincode: _str(j['pincode']),
        addressType: _str(j['addressType']),
        isDefault: _bool(j['isDefault']),
      );

  Map<String, dynamic> toJson() => {
        'fullName': fullName,
        'phone': phone,
        'addressLine1': addressLine1,
        if (addressLine2 != null) 'addressLine2': addressLine2,
        'city': city,
        'state': state,
        'pincode': pincode,
        'addressType': addressType,
      };
}

class OrderSummary {
  OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentStatus,
    required this.totalAmount,
    required this.createdAt,
    this.itemsCount = 0,
    this.firstItemName,
  });

  final String id;
  final String orderNumber;
  final String status;
  final String paymentStatus;
  final double totalAmount;
  final DateTime createdAt;
  final int itemsCount;
  final String? firstItemName;

  factory OrderSummary.fromJson(Map<String, dynamic> j) => OrderSummary(
        id: _str(j['id']),
        orderNumber: _str(j['orderNumber']),
        status: _str(j['status']),
        paymentStatus: _str(j['paymentStatus']),
        totalAmount: _num(j['totalAmount']),
        createdAt: DateTime.tryParse(_str(j['createdAt']))?.toLocal() ?? DateTime.now(),
        itemsCount: j['itemsCount'] as int? ?? 0,
        firstItemName: j['firstItemName']?.toString(),
      );
}

class OrderDetail {
  OrderDetail({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentStatus,
    this.paymentMethod = '',
    required this.totalAmount,
    required this.subtotal,
    required this.discountAmount,
    required this.shippingCharge,
    required this.createdAt,
    this.items = const [],
    this.timeline = const [],
    this.shippingAddress,
  });

  final String id;
  final String orderNumber;
  final String status;
  final String paymentStatus;
  final String paymentMethod;
  final double totalAmount;
  final double subtotal;
  final double discountAmount;
  final double shippingCharge;
  final DateTime createdAt;
  final List<OrderLine> items;
  final List<TimelineEntry> timeline;
  final Address? shippingAddress;

  factory OrderDetail.fromJson(Map<String, dynamic> j) => OrderDetail(
        id: _str(j['id']),
        orderNumber: _str(j['orderNumber']),
        status: _str(j['status']),
        paymentStatus: _str(j['paymentStatus']),
        paymentMethod: _str(j['paymentMethod']),
        totalAmount: _num(j['totalAmount']),
        subtotal: _num(j['subtotal']),
        discountAmount: _num(j['discountAmount']),
        shippingCharge: _num(j['shippingCharge']),
        createdAt: DateTime.tryParse(_str(j['createdAt']))?.toLocal() ?? DateTime.now(),
        items: (j['items'] as List? ?? [])
            .map((i) => OrderLine(
                  name: _str(i['productName']),
                  sku: _str(i['productSku']),
                  quantity: i['quantity'] as int? ?? 0,
                  price: _num(i['price']),
                ))
            .toList(),
        timeline: (j['statusHistory'] as List? ?? [])
            .map((h) => TimelineEntry(
                  status: _str(h['status']),
                  notes: h['notes']?.toString(),
                  at: DateTime.tryParse(_str(h['createdAt']))?.toLocal(),
                ))
            .toList(),
        shippingAddress: j['shippingAddress'] == null ? null : Address.fromJson(j['shippingAddress'] as Map<String, dynamic>),
      );
}

class OrderLine {
  OrderLine({required this.name, required this.sku, required this.quantity, required this.price});
  final String name;
  final String sku;
  final int quantity;
  final double price;
  double get total => price * quantity;
}

class TimelineEntry {
  TimelineEntry({required this.status, this.notes, this.at});
  final String status;
  final String? notes;
  final DateTime? at;
}

class NotificationItem {
  NotificationItem({required this.id, required this.title, required this.message, required this.isRead, required this.createdAt, this.type});
  final String id;
  final String? title;
  final String message;
  final bool isRead;
  final DateTime createdAt;
  final String? type;

  factory NotificationItem.fromJson(Map<String, dynamic> j) => NotificationItem(
        id: _str(j['id']),
        title: j['title']?.toString(),
        message: _str(j['message']),
        isRead: _bool(j['isRead']),
        createdAt: DateTime.tryParse(_str(j['createdAt']))?.toLocal() ?? DateTime.now(),
        type: j['type']?.toString(),
      );
}

String money(double n) {
  final f = n.toStringAsFixed(2).replaceAll(RegExp(r'\.00$'), '');
  return '₹$f';
}

String moneyFull(double n) => '₹${n.toStringAsFixed(2)}';
