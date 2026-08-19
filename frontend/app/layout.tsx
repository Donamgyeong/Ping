import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "./components/Navbar";
import ToastBannerContainer from "./components/ToastBannerContainer";
import { AuthProvider } from "@/hooks/useAuth";
import { WebSocketProvider } from "@/hooks/useWebSocket";
import "./globals.css";
import "./main.css";
import "leaflet/dist/leaflet.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ping",
  description: "A location-based social network.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <WebSocketProvider>
            <Navbar />
            <main>{children}</main>
            <ToastBannerContainer />
          </WebSocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
