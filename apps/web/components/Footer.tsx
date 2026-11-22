import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h4>Baba Communication</h4>
            <p className="small" style={{ margin: 0 }}>
              Trusted wholesale supplier of mobile spare parts since 2009. Serving repair shops, retailers and
              distributors across India with genuine, quality-tested parts at B2B prices.
            </p>
          </div>
          <div>
            <h4>Shop</h4>
            <Link href="/products">All Products</Link>
            <Link href="/categories">Categories</Link>
            <Link href="/brands">Brands</Link>
            <Link href="/offers">Offers</Link>
          </div>
          <div>
            <h4>Customer Care</h4>
            <Link href="/track">Track Order</Link>
            <Link href="/account?tab=orders">My Orders &amp; Returns</Link>
            <Link href="/faqs">FAQs</Link>
            <Link href="/contact">Contact Us</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link href="/page/about">About Us</Link>
            <Link href="/page/privacy">Privacy Policy</Link>
            <Link href="/page/terms">Terms &amp; Conditions</Link>
            <Link href="/page/shipping-policy">Shipping Policy</Link>
            <Link href="/page/return-policy">Return Policy</Link>
            <Link href="/page/cancellation-policy">Cancellation Policy</Link>
          </div>
        </div>
        <div className="footer-bottom">© {new Date().getFullYear()} Baba Communication · InnovateX Technology Pvt. Ltd.</div>
      </div>
    </footer>
  );
}
