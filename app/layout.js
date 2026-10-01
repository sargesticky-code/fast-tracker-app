import LegacyRouteRedirect from "@/components/legacy-route-redirect";
import "./globals.css";
import "./forebet-dashboard.css";
import "./dashboard-polish.css";
import "./detail-polish.css";
import "./homepage.css";

export const metadata = {
  title: "Fast Tracker 2026",
  description: "Football data, models and value-bet intelligence",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b2a4a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><LegacyRouteRedirect />{children}</body>
    </html>
  );
}
