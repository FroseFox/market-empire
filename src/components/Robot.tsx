"use client";
// Mascotte du jeu : « Tic », le robot-guide. Illustration originale en SVG, animée en CSS
// (flottement, clignement, antenne, bras, courbe sur l'écran du torse). Les animations sont
// coupées pour les joueurs qui préfèrent moins de mouvement (voir globals.css, classes .bot-*).
import { useId } from "react";

export type RobotMood = "happy" | "think" | "cheer";

export default function Robot({ size = 56, mood = "happy", still = false }: { size?: number; mood?: RobotMood; /** Sans animation (petites tailles, listes). */ still?: boolean }) {
  const id = useId().replace(/:/g, "");
  const g = (n: string) => `${n}-${id}`;
  const anim = still ? "" : " bot-live";
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Tic, le robot-guide de Market Empire" className={`shrink-0 overflow-visible bot bot-${mood}${anim}`}>
      <defs>
        <linearGradient id={g("shell")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#DCE6F5" /></linearGradient>
        <linearGradient id={g("body")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B82F6" /><stop offset="1" stopColor="#1D4ED8" /></linearGradient>
        <linearGradient id={g("visor")} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1E293B" /><stop offset="1" stopColor="#0B1220" /></linearGradient>
        <radialGradient id={g("eye")} cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#E0F7FF" /><stop offset="0.45" stopColor="#67D5FF" /><stop offset="1" stopColor="#1FA6E8" /></radialGradient>
        <radialGradient id={g("glow")} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor={mood === "cheer" ? "#FCD34D" : "#34D399"} /><stop offset="1" stopColor={mood === "cheer" ? "#F59E0B" : "#059669"} /></radialGradient>
        <linearGradient id={g("screen")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EFF6FF" /><stop offset="1" stopColor="#BFDBFE" /></linearGradient>
      </defs>

      {/* ombre au sol : elle respire avec le flottement */}
      <ellipse className="bot-shadow" cx="60" cy="112" rx="24" ry="4.5" fill="#0F172A" opacity=".16" />

      <g className="bot-float">
        {/* réacteur sous le corps */}
        <path className="bot-jet" d="M52 96 Q60 108 68 96 Z" fill="#7DD3FC" opacity=".75" />

        {/* bras gauche */}
        <g className="bot-arm-l">
          <path d="M30 70 Q20 76 19 88" stroke="#1D4ED8" strokeWidth="7" strokeLinecap="round" fill="none" />
          <circle cx="19" cy="89" r="5.5" fill={`url(#${g("shell")})`} stroke="#1D4ED8" strokeWidth="2" />
        </g>
        {/* bras droit : salue, réfléchit ou applaudit selon l'humeur */}
        <g className="bot-arm-r">
          <path d={mood === "happy" ? "M90 70 Q102 64 104 50" : mood === "think" ? "M90 70 Q100 68 96 56" : "M90 70 Q102 62 104 46"} stroke="#1D4ED8" strokeWidth="7" strokeLinecap="round" fill="none" />
          <circle cx={mood === "think" ? 95 : 104} cy={mood === "happy" ? 49 : mood === "think" ? 55 : 45} r="5.5" fill={`url(#${g("shell")})`} stroke="#1D4ED8" strokeWidth="2" />
        </g>

        {/* corps */}
        <rect x="32" y="62" width="56" height="36" rx="15" fill={`url(#${g("body")})`} />
        <path d="M36 74 Q60 66 84 74" stroke="#93C5FD" strokeWidth="1.6" fill="none" opacity=".55" />
        {/* écran du torse : une courbe de bourse qui se trace */}
        <rect x="43" y="72" width="34" height="19" rx="5" fill={`url(#${g("screen")})`} stroke="#1E40AF" strokeWidth="1.4" />
        <path className="bot-chart" d="M47 86 L53 81 L58 84 L64 77 L69 80 L73 75" stroke="#2563EB" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
        <circle className="bot-chart-dot" cx="73" cy="75" r="2.2" fill="#10B981" />

        {/* cou */}
        <rect x="52" y="56" width="16" height="9" rx="3" fill="#1E40AF" />

        {/* tête */}
        <g className="bot-head">
          {/* antenne */}
          <path d="M60 18 L60 9" stroke="#1D4ED8" strokeWidth="3" strokeLinecap="round" />
          <circle className="bot-antenna" cx="60" cy="7" r="5" fill={`url(#${g("glow")})`} />
          {/* oreilles */}
          <rect x="15" y="31" width="8" height="16" rx="4" fill="#1D4ED8" />
          <rect x="97" y="31" width="8" height="16" rx="4" fill="#1D4ED8" />
          {/* coque */}
          <rect x="21" y="16" width="78" height="44" rx="19" fill={`url(#${g("shell")})`} stroke="#2563EB" strokeWidth="3" />
          <path d="M32 22 Q60 15 88 22" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".9" />
          {/* visière */}
          <rect x="29" y="25" width="62" height="27" rx="13" fill={`url(#${g("visor")})`} />
          <path d="M35 30 Q46 26 58 28" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".22" />
          {/* yeux */}
          {mood === "think" ? (
            <g className="bot-eyes">
              <rect x="40" y="35" width="13" height="5" rx="2.5" fill="#67D5FF" />
              <rect x="67" y="33" width="13" height="5" rx="2.5" fill="#67D5FF" />
            </g>
          ) : mood === "cheer" ? (
            <g className="bot-eyes" stroke="#67D5FF" strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M40 40 Q46.5 31 53 40" />
              <path d="M67 40 Q73.5 31 80 40" />
            </g>
          ) : (
            <g className="bot-eyes">
              <ellipse cx="46.5" cy="38" rx="6.5" ry="7" fill={`url(#${g("eye")})`} />
              <ellipse cx="73.5" cy="38" rx="6.5" ry="7" fill={`url(#${g("eye")})`} />
              <circle cx="44.3" cy="35.5" r="1.9" fill="#FFFFFF" />
              <circle cx="71.3" cy="35.5" r="1.9" fill="#FFFFFF" />
            </g>
          )}
          {/* bouche */}
          {mood === "think" ? <path d="M55 46.5 L65 46.5" stroke="#67D5FF" strokeWidth="2.2" strokeLinecap="round" />
            : <path d={mood === "cheer" ? "M53 44.5 Q60 51.5 67 44.5 Z" : "M54 45 Q60 49.5 66 45"} stroke="#67D5FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill={mood === "cheer" ? "#67D5FF" : "none"} />}
          {/* joues */}
          <circle cx="34" cy="45" r="2.6" fill="#F472B6" opacity=".55" />
          <circle cx="86" cy="45" r="2.6" fill="#F472B6" opacity=".55" />
        </g>

        {/* étincelles de joie */}
        {mood === "cheer" && (
          <g className="bot-sparks" fill="#F59E0B">
            <path d="M12 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
            <path d="M108 20 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" />
            <path d="M100 4 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" />
          </g>
        )}
        {/* point d'interrogation quand il réfléchit */}
        {mood === "think" && <text className="bot-ask" x="103" y="30" fontSize="18" fontWeight="800" fill="#2563EB" fontFamily="Montserrat, system-ui, sans-serif">?</text>}
      </g>
    </svg>
  );
}
