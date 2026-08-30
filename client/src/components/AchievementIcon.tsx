import { useId } from "react";

export type AchievementIconName = "flame" | "book" | "spark" | "calendar" | "crown" | "target";

type AchievementIconProps = {
  name: AchievementIconName;
  size?: number;
  muted?: boolean;
  className?: string;
};

const iconLabels: Record<AchievementIconName, string> = {
  flame: "سلسلة الحفظ",
  book: "جزء محفوظ",
  spark: "جلسة متقنة",
  calendar: "مواظبة أسبوعية",
  crown: "إنجاز مميز",
  target: "الهدف القادم",
};

export function AchievementIcon({ name, size = 64, muted = false, className = "" }: AchievementIconProps) {
  const id = useId().replace(/:/g, "");
  const gradientId = `achievement-${name}-${id}`;
  return (
    <span className={`achievement-icon achievement-icon--${name} ${muted ? "is-muted" : ""} ${className}`} role="img" aria-label={iconLabels[name]}>
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
        <defs>
          {/* The muted stops are a darker warm gray-brown, not the near-white they used to be:
              at the original `#D6CFC4`/`#B8AEA0`, thin strokes (the calendar/book line-art) sat at
              roughly 1.2:1 contrast against the locked card's own pale cream background — visually
              indistinguishable from a blank circle. This keeps the same "muted, not gold" hue but
              dark enough that the glyph itself stays legible. */}
          <linearGradient id={gradientId} x1="16" y1="12" x2="64" y2="70" gradientUnits="userSpaceOnUse">
            <stop stopColor={muted ? "#8B7D68" : "#F7D48A"} />
            <stop offset="1" stopColor={muted ? "#6B5D48" : "#B9782E"} />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r="35" fill={`url(#${gradientId})`} fillOpacity={muted ? ".28" : ".22"} stroke={`url(#${gradientId})`} strokeOpacity={muted ? ".42" : ".7"} strokeWidth="1.5" />
        {name === "flame" && <path d="M42.2 14.5c1.5 8.5-3.2 13.2-6.8 17.3-2.9 3.3-4.7 6.1-3.8 10.3-2-1.4-3.2-3.2-3.8-5.2-4.4 5.3-5.2 10.2-2.9 15.2 2.2 4.8 7.5 8 13.6 8 8.8 0 15.7-6.1 15.7-14.1 0-8.2-5.3-14.9-11.9-19.3.5 4.2-.2 7.2-3.5 10.5.3-5.6-1.2-9.8-6.6-12.7Z" fill={`url(#${gradientId})`} />}
        {name === "flame" && <path d="M38.2 45.2c2.3-2.2 3.4-4.5 3.1-7.5 3.9 3.3 5.7 6.3 5.7 9.7 0 3.9-3.1 7.1-7 7.1-3.7 0-6.5-2.5-6.5-5.7 0-1.1.5-2.4 1.7-4.3.7 1.3 1.6 2.3 3 3 .1-.8 0-1.4 0-2.3Z" fill="#FFF4C9" fillOpacity=".9" />}
        {name === "book" && <><path d="M40 24v31" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinecap="round" /><path d="M39.5 27c-6-3.2-12.6-3.7-19.7-1.3v23.8c7.1-2.4 13.7-1.9 19.7 1.3V27Zm1 0c6-3.2 12.6-3.7 19.7-1.3v23.8c-7.1-2.4-13.7-1.9-19.7 1.3V27Z" fill="url(#${gradientId})" fillOpacity=".38" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinejoin="round" /><path d="M25 33c4.6-1.2 8.7-.5 11.7 1.1M25 40c4.6-1.2 8.7-.5 11.7 1.1M55 33c-4.6-1.2-8.7-.5-11.7 1.1M55 40c-4.6-1.2-8.7-.5-11.7 1.1" stroke={`url(#${gradientId})`} strokeWidth="1.35" strokeLinecap="round" /></>}
        {name === "spark" && <><path d="m40 17 4.8 15.2L60 37l-15.2 4.8L40 57l-4.8-15.2L20 37l15.2-4.8L40 17Z" fill={`url(#${gradientId})`} /><circle cx="61" cy="20" r="3" fill={`url(#${gradientId})`} /><circle cx="20" cy="58" r="2.3" fill={`url(#${gradientId})`} /></>}
        {name === "calendar" && <><rect x="22" y="24" width="36" height="33" rx="6" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.5" /><path d="M22 34h36M31 19v10M49 19v10" stroke={`url(#${gradientId})`} strokeWidth="2.5" strokeLinecap="round" /><path d="m31 44 5 5 13-13" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></>}
        {name === "crown" && <><path d="m20 29 10 8 10-16 10 16 10-8-4 28H24l-4-28Z" fill={`url(#${gradientId})`} fillOpacity=".75" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinejoin="round" /><path d="M26 52h28" stroke="#FFF5D8" strokeOpacity=".75" strokeWidth="2" strokeLinecap="round" /><circle cx="20" cy="28" r="3" fill={`url(#${gradientId})`} /><circle cx="40" cy="20" r="3" fill={`url(#${gradientId})`} /><circle cx="60" cy="28" r="3" fill={`url(#${gradientId})`} /></>}
        {name === "target" && <><circle cx="40" cy="40" r="18" fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" /><circle cx="40" cy="40" r="9" fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" /><circle cx="40" cy="40" r="3.5" fill={`url(#${gradientId})`} /><path d="M40 17v7M40 56v7M17 40h7M56 40h7" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinecap="round" /></>}
      </svg>
    </span>
  );
}
