import { Check, LockKeyhole } from "lucide-react";
import { AchievementIcon, type AchievementIconName } from "./AchievementIcon";

type AchievementCardProps = {
  icon: AchievementIconName;
  title: string;
  description: string;
  meta: string;
  progress?: number;
  unlocked?: boolean;
};

export function AchievementCard({ icon, title, description, meta, progress = 100, unlocked = false }: AchievementCardProps) {
  const safeProgress = Math.max(0, Math.min(progress, 100));
  return (
    <article className={`achievement-card ${unlocked ? "is-unlocked" : "is-locked"}`}>
      <div className="achievement-card__topline">
        <AchievementIcon name={icon} size={58} muted={!unlocked} />
        <span className={`achievement-card__state ${unlocked ? "is-unlocked" : ""}`}>
          {unlocked ? <><Check size={13} /> مكتمل</> : <><LockKeyhole size={12} /> قريباً</>}
        </span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="achievement-card__footer"><span>{meta}</span><b>{safeProgress}%</b></div>
      <div className="achievement-card__track" aria-hidden="true"><i style={{ width: `${safeProgress}%` }} /></div>
    </article>
  );
}
