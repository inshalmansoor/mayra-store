import type { Metadata } from "next";
import { Playfair_Display, Jost, Parisienne, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { ToastProvider } from "@/context/ToastContext";
import { PromoProvider } from "@/context/PromoContext";
import Toast from "@/components/Toast";

// next/font self-hosts these — no external @import, no layout shift. Same
// four families/weights as the prototype. See plans/04 §6.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display-raw",
  display: "swap",
});
const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-caps-raw",
  display: "swap",
});
const parisienne = Parisienne({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-script-raw",
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body-raw",
  display: "swap",
});

const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Mayra Store";

export const metadata: Metadata = {
  title: { default: storeName, template: `%s — ${storeName}` },
  description: "Jewels that speak for you. 18k gold-plated stainless steel necklaces, bracelets, rings and earrings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${jost.variable} ${parisienne.variable} ${cormorant.variable}`}>
      <body>
        <style>{`
          :root {
            --font-display: var(--font-display-raw), "Times New Roman", serif;
            --font-caps: var(--font-caps-raw), system-ui, sans-serif;
            --font-script: var(--font-script-raw), cursive;
            --font-body: var(--font-body-raw), Georgia, serif;
          }
          body { font-family: var(--font-body); }
        `}</style>
        <ToastProvider>
          <WishlistProvider>
            <CartProvider>
              <PromoProvider>
                {children}
                <Toast />
              </PromoProvider>
            </CartProvider>
          </WishlistProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
