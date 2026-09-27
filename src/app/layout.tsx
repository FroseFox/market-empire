import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppShell from "@/components/AppShell";

// Montserrat auto-hébergée (police variable, graisses 100–900)
const montserrat = localFont({ src: "./fonts/montserrat-latin-wght-normal.woff2", variable: "--font-montserrat", weight: "100 900" });

export const metadata: Metadata = {
  title: "Market Empire",
  description: "Construis, investis, domine — un jeu de stratégie économique basé sur les vrais marchés.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
