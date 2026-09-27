import type { Metadata, Viewport } from "next";
import { ThemedToaster } from "@/components/themed-toaster";
import { siteUrl } from "@/lib/site-url";
import { themeInitScript } from "@/lib/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by the inline script before hydration
    <html lang="en-IN" className="h-full antialiased" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <ThemedToaster />
      </body>
    </html>
  );
}
