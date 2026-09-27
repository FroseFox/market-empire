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

// GitHub Pages ne permet pas d'en-têtes HTTP personnalisés : la politique de sécurité
// passe par une balise <meta>. Le site ne charge que ses propres fichiers
// (+ les logos Logo.dev) et ne contacte que la base Supabase des cours.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.logo.dev",
  "font-src 'self'",
  "connect-src 'self' https://elpkixotuarcymalehjs.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${montserrat.variable} h-full antialiased`}>
      <head>
        {process.env.NODE_ENV === "production" && <meta httpEquiv="Content-Security-Policy" content={CSP} />}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
