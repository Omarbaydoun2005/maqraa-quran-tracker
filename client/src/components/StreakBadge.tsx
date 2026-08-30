import { useId } from "react";

export type StreakBadgeProps = {
  days: number;
  label?: string;
  compact?: boolean;
  showCount?: boolean;
  className?: string;
};

function arabicDigits(value: number) {
  return new Intl.NumberFormat("ar-SA", { numberingSystem: "arab" }).format(value);
}

/** A small, accessible streak flame with a restrained pulse and celebratory sparks. */
export function StreakBadge({ days, label = "أيام متتالية", compact = false, showCount = true, className = "" }: StreakBadgeProps) {
  const gradientId = `streak-gradient-${useId().replace(/[:]/g, "")}`;
  const accessibleLabel = `${arabicDigits(days)} ${label}`;

  return (
    <div className={`streak-badge ${compact ? "is-compact" : ""} ${className}`} role="img" aria-label={accessibleLabel}>
      <span className="streak-badge__halo" aria-hidden="true" />
      <span className="streak-badge__spark streak-badge__spark--one" aria-hidden="true" />
      <span className="streak-badge__spark streak-badge__spark--two" aria-hidden="true" />
      <span className="streak-badge__spark streak-badge__spark--three" aria-hidden="true" />
      <svg className="streak-badge__flame" viewBox="0 0 64 72" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="14" y1="8" x2="49" y2="61" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFE6A4" />
            <stop offset=".38" stopColor="#F4A945" />
            <stop offset="1" stopColor="#D75B2A" />
          </linearGradient>
          <linearGradient id={`${gradientId}-core`} x1="29" y1="30" x2="41" y2="57" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFF8D9" />
            <stop offset="1" stopColor="#F4C45F" />
          </linearGradient>
        </defs>
        <path className="streak-badge__flame-shadow" d="M35.4 3.8c1.1 9.4-2.8 14.2-7.1 18.9-3.1 3.5-5.3 6.6-4.6 11.2-2-1.4-3.5-3.2-4.3-5.3-5.2 6.2-7.2 12.6-5.2 19 2.6 8.5 10.1 14.1 19.3 14.1 11.1 0 20-8.1 20-18.7 0-11.2-8.2-20.1-18.1-25.4 1.1 5.5-.3 9.2-3.8 12.7.4-6.6-1.5-12.6-6.2-16.5Z" fill={`url(#${gradientId})`} />
        <path d="M33.2 34.7c2.9-2.9 4.6-6.1 4.1-10.7 6.7 5.1 10.2 10.3 10.2 16.2 0 7-5.7 12.6-12.8 12.6-6.6 0-11.7-4.7-11.7-10.8 0-3.5 1.6-6.8 4.8-10.8.7 3 2.4 5.5 5.4 7.4-.4-1.8-.2-2.8 0-3.9Z" fill={`url(#${gradientId}-core)`} />
        <path d="M16.2 51.1c2.8 5.6 8.7 9.4 15.6 9.4 10.8 0 19.8-7.7 19.8-18.5" stroke="rgba(255,248,218,.46)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {showCount && <span className="streak-badge__count">{arabicDigits(days)}</span>}
      {!compact && <span className="streak-badge__label">{label}</span>}
    </div>
  );
}
