import LegacyRouteRedirect from "@/components/legacy-route-redirect";
import "./globals.css";
import "./forebet-dashboard.css";
import "./dashboard-polish.css";
import "./detail-polish.css";

export const metadata = {
  title: "Fast Tracker 2026",
  description: "HKJC-first football intelligence",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07110e",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-HK">
      <body><LegacyRouteRedirect />{children}</body>
    </html>
  );
}
