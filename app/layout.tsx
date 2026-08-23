import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./brand.css";
import "./auth.css";
import "./marketplace.css";
import "./listing-detail.css";
import "./payment.css";
import "./mobile.css";
import "./compact-marketplace.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://shipdealersconnect.site"),
  title: "Ship Dealers Business Connect | Buy and Sell Online",
  description: "A secure Ghana marketplace where verified members advertise products and connect with buyers.",
  keywords: ["Ghana marketplace","buy and sell Ghana","classified adverts Ghana","online marketplace Ghana","Ship Dealers Business Connect"],
  alternates: { canonical: "/" },
  openGraph: { title: "Ship Dealers Business Connect", description: "Buy and sell with confidence across Ghana.", url: "/", siteName: "Ship Dealers Business Connect", locale: "en_GH", type: "website", images: [{url:"/og-marketplace.png",width:1200,height:630,alt:"Ship Dealers Business Connect marketplace"}] },
  twitter: { card:"summary_large_image", title:"Ship Dealers Business Connect", description:"Buy and sell with confidence across Ghana.", images:["/og-marketplace.png"] },
  robots: { index:true, follow:true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GH">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
