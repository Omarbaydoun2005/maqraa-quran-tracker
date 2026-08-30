type BrandMarkProps = {
  size?: number;
  className?: string;
  labelled?: boolean;
};

/** The maqraa's full name, fully vocalized (tashkeel) at the user's request — used as the standalone label everywhere the name appears on its own. */
export const MAQRAA_NAME_VOWELED = "مَقْرَأَةُ عَبْدُ اللهِ بنُ عبّاسٍ رَضِي اللهُ عَنْهُمَا";

/** The maqraa's real crest (open Mus'haf on a stand, quill and inkwell, name ribbon), used everywhere a compact icon is needed. */
export function BrandMark({ size = 40, className = "", labelled = false }: BrandMarkProps) {
  return (
    <span className={`brand-mark-wrap ${className}`} aria-label={labelled ? MAQRAA_NAME_VOWELED : undefined} role={labelled ? "img" : undefined}>
      <img
        src="/media/maqraa-logo.svg"
        alt=""
        aria-hidden={labelled ? undefined : "true"}
        width={size}
        height={size}
        style={{ width: size, height: size, display: "block", objectFit: "contain" }}
      />
    </span>
  );
}

export function BrandLockup({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <div className={`brand-lockup ${compact ? "is-compact" : ""} ${className}`}>
      <BrandMark size={compact ? 32 : 40} />
      <div>
        <p>مَقْرَأَةُ</p>
        <strong>عَبْدُ اللهِ بنُ عبّاسٍ</strong>
      </div>
    </div>
  );
}
