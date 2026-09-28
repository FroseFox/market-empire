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

export default function DiscordButton({ small = false }: { small?: boolean }) {
  return (
    <button type="button" onClick={loginWithDiscord}
      className={`inline-flex items-center gap-2 rounded-[10px] bg-[#5865F2] text-white font-semibold hover:bg-[#4752C4] transition-colors ${small ? "px-3 py-1.5 text-[12px]" : "px-3.5 py-2 text-[13px]"}`}>
      <DiscordIcon size={small ? 16 : 18} />
      Se connecter avec Discord
    </button>
  );
}
