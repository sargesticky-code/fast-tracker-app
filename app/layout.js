import "./globals.css";
import "./homepage.css";
import "react-day-picker/style.css";

export const metadata = {
  title: "Fast Tracker · Flashscore raw fixtures",
  description: "Flashscore source fixtures and captured Bet365 H/D/A prices",
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
      <body>{children}</body>
    </html>
  );
}
