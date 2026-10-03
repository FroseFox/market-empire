// Mascotte du jeu : un petit robot-guide (dessin original, en SVG, aux couleurs de la charte).
export default function Robot({ size = 56, mood = "happy" }: { size?: number; mood?: "happy" | "think" | "cheer" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Le robot-guide de Market Empire" className="shrink-0">
      {/* antenne */}
      <line x1="32" y1="10" x2="32" y2="4" stroke="#1D4ED8" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="4" r="3" fill={mood === "cheer" ? "#F59E0B" : "#10B981"} />
      {/* bras */}
      {mood === "cheer" ? (
        <>
          <path d="M14 40 L6 28" stroke="#1D4ED8" strokeWidth="4" strokeLinecap="round" />
          <path d="M50 40 L58 28" stroke="#1D4ED8" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M14 42 L8 50" stroke="#1D4ED8" strokeWidth="4" strokeLinecap="round" />
          <path d={mood === "think" ? "M50 42 L54 32" : "M50 42 L56 50"} stroke="#1D4ED8" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {/* corps */}
      <rect x="18" y="36" width="28" height="20" rx="7" fill="#2563EB" />
      <rect x="25" y="42" width="14" height="8" rx="2.5" fill="#DBEAFE" />
      <path d="M27 48 L30 45 L33 47 L37 43" stroke="#2563EB" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* tête */}
      <rect x="12" y="10" width="40" height="27" rx="10" fill="#FFFFFF" stroke="#2563EB" strokeWidth="2.6" />
      <rect x="17" y="16" width="30" height="15" rx="7" fill="#0F172A" />
      {mood === "think" ? (
        <>
          <rect x="22" y="22" width="6" height="2.6" rx="1.3" fill="#7DD3FC" />
          <rect x="36" y="22" width="6" height="2.6" rx="1.3" fill="#7DD3FC" />
        </>
      ) : (
        <>
          <circle cx="25" cy="23.5" r="3.2" fill="#7DD3FC" />
          <circle cx="39" cy="23.5" r="3.2" fill="#7DD3FC" />
        </>
      )}
      {/* pieds */}
      <rect x="22" y="55" width="8" height="5" rx="2.5" fill="#1D4ED8" />
      <rect x="34" y="55" width="8" height="5" rx="2.5" fill="#1D4ED8" />
    </svg>
  );
}
