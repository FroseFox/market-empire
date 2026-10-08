"use client";
import { loginWithDiscord } from "@/lib/auth";

/** Logo Discord (marque déposée, utilisée ici seulement pour le bouton de connexion). */
export function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  );
}

/** Logo Google (marque déposée, utilisée ici seulement pour le bouton de connexion). */
export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.200 3.5-8.700Z" />
      <path fill="#34A853" d="M12 24c3.200 0 6-1.100 8-2.900l-3.900-3c-1.100.7-2.500 1.200-4.100 1.200-3.100 0-5.800-2.100-6.700-5H1.300v3.100A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.300 14.300a7.200 7.200 0 0 1 0-4.600V6.600H1.300a12 12 0 0 0 0 10.800l4-3.100Z" />
      <path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.600 1.800L20 3.100A12 12 0 0 0 1.300 6.600l4 3.100c.9-2.900 3.600-4.900 6.700-4.900Z" />
    </svg>
  );
}

/** Petit logo du service de connexion d'un compte, et son nom. */
export function ProviderTag({ via, long = false }: { via?: "discord" | "google" | "email"; long?: boolean }) {
  const name = via === "google" ? "Google" : via === "email" ? "Compte de test" : "Discord";
  return <>{via === "google" ? <GoogleIcon size={11} /> : via === "email" ? null : <DiscordIcon size={11} />}{long && via !== "email" ? `Connecté avec ${name}` : name}</>;
}

export default function DiscordButton({ small = false }: { small?: boolean }) {
  return (
    <button type="button" onClick={loginWithDiscord}
      className={`inline-flex items-center gap-2 rounded-[10px] bg-[#5865F2] text-white font-semibold hover:bg-[#4752C4] transition-colors ${small ? "px-3 py-1.5 text-[12px]" : "px-3.5 py-2 text-[13px]"}`}>
      <DiscordIcon size={small ? 16 : 18} />
      Se connecter avec Discord
    </button>
  );
}
