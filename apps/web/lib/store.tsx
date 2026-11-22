"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api, setToken, getToken } from "./api";

export interface User {
  id: string;
  phone: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  shopName?: string | null;
  gstNumber?: string | null;
  role: string;
  status: string;
  avatarUrl?: string | null;
}

export interface CartProduct {
  id: string;
  name: string;
  sku: string;
  price: string;
  mrp: string | null;
  boxPrice: string | null;
  boxQuantity: number | null;
  stockQuantity: number;
  stockStatus: string;
  image: string | null;
  brand?: { name: string } | null;
}

export interface CartLine {
  id: string;
  quantity: number;
  isSavedForLater: boolean;
  unitPrice: string;
  lineTotal: string;
  bulkApplied: boolean;
  product: CartProduct;
}

export interface CartData {
  items: CartLine[];
  savedForLater: CartLine[];
  coupon: { code: string; discountAmount?: string; message?: string } | null;
  summary: { subtotal: string; discount: string; shipping: string; total: string };
}

const EMPTY_CART: CartData = {
  items: [],
  savedForLater: [],
  coupon: null,
  summary: { subtotal: "0", discount: "0", shipping: "0", total: "0" },
};

interface StoreValue {
  user: User | null;
  loading: boolean;
  cart: CartData;
  cartCount: number;
  wishlist: string[];
  login: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
  refreshCart: () => Promise<void>;
  addToCart: (productId: string, qty?: number) => Promise<void>;
  updateCartItem: (itemId: string, quantity: number) => Promise<void>;
  removeCartItem: (itemId: string) => Promise<void>;
  saveForLater: (itemId: string, saved: boolean) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  toggleWishlist: (productId: string) => Promise<void>;
  refreshWishlist: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartData>(EMPTY_CART);
  const [wishlist, setWishlist] = useState<string[]>([]);

  const refreshCart = useCallback(async () => {
    try {
      const data = await api<CartData>("/cart");
      setCart(data);
    } catch {
      setCart(EMPTY_CART);
    }
  }, []);

  const refreshWishlist = useCallback(async () => {
    if (!getToken()) return;
    try {
      const data = await api<{ product: { id: string } }[]>("/wishlist");
      setWishlist(data.map((i) => i.product.id));
    } catch {
      /* ignore */
    }
  }, []);

  // On mount: restore session + cart + wishlist
  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const me = await api<{ user: User }>("/auth/me");
          setUser(me.user);
        } catch (e: any) {
          // Only a rejected session logs out; a network blip keeps the stored session.
          if (e?.status === 401) setToken(null);
        }
      }
      await Promise.all([refreshCart(), refreshWishlist()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    (token: string, u: User, refreshToken?: string) => {
      setToken(token, refreshToken ?? null);
      setUser(u);
      refreshCart();
      refreshWishlist();
    },
    [refreshCart, refreshWishlist]
  );

  const logout = useCallback(() => {
    api("/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setUser(null);
    setWishlist([]);
    setCart(EMPTY_CART);
  }, []);

  const addToCart = useCallback(
    async (productId: string, qty = 1) => {
      await api("/cart/add", { method: "POST", body: JSON.stringify({ productId, quantity: qty }) });
      await refreshCart();
    },
    [refreshCart]
  );

  const updateCartItem = useCallback(
    async (itemId: string, quantity: number) => {
      await api("/cart/update", { method: "PUT", body: JSON.stringify({ itemId, quantity }) });
      await refreshCart();
    },
    [refreshCart]
  );

  const removeCartItem = useCallback(
    async (itemId: string) => {
      await api(`/cart/remove?itemId=${itemId}`, { method: "DELETE" });
      await refreshCart();
    },
    [refreshCart]
  );

  const saveForLater = useCallback(
    async (itemId: string, saved: boolean) => {
      await api("/cart/save-for-later", { method: "POST", body: JSON.stringify({ itemId, saved }) });
      await refreshCart();
    },
    [refreshCart]
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      await api("/cart/apply-coupon", { method: "POST", body: JSON.stringify({ code }) });
      await refreshCart();
    },
    [refreshCart]
  );

  const removeCoupon = useCallback(async () => {
    await api("/cart/remove-coupon", { method: "DELETE" });
    await refreshCart();
  }, [refreshCart]);

  const toggleWishlist = useCallback(
    async (productId: string) => {
      if (!getToken()) {
        window.location.href = "/login?next=/wishlist";
        return;
      }
      const has = wishlist.includes(productId);
      if (has) {
        await api(`/wishlist/remove?productId=${productId}`, { method: "DELETE" });
        setWishlist((w) => w.filter((id) => id !== productId));
      } else {
        await api("/wishlist/add", { method: "POST", body: JSON.stringify({ productId }) });
        setWishlist((w) => [...w, productId]);
      }
    },
    [wishlist]
  );

  const cartCount = useMemo(() => cart.items.reduce((s, i) => s + i.quantity, 0), [cart.items]);

  const value: StoreValue = {
    user,
    loading,
    cart,
    cartCount,
    wishlist,
    login,
    logout,
    refreshCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    saveForLater,
    applyCoupon,
    removeCoupon,
    toggleWishlist,
    refreshWishlist,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <Providers>");
  return ctx;
}
