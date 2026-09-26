import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Custom T-Shirts, Designed by You | Sweet Ginger Design Studio",
    template: "%s | Sweet Ginger Design Studio",
  },
  description:
    "Design custom T-shirts, oversized tees and polos online. Add your text or logo, see it on the shirt, and order one piece or bulk quantities for your team or company. Printed in Jaipur by Sweet Ginger.",
  applicationName: "Sweet Ginger Design Studio",
  openGraph: { type: "website", siteName: "Sweet Ginger Design Studio", locale: "en_IN" },
};

export const viewport: Viewport = {
  themeColor: "#faf8f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
