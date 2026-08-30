import { BadgeCheck, CircleCheck, RefreshCcw, Sparkles, type LucideIcon } from "lucide-react";

export type EvaluationScore = "ممتاز" | "جيد جداً" | "جيد" | "إعادة";

type EvaluationBadgeProps = {
  score: string;
  compact?: boolean;
  className?: string;
};

type EvaluationMeta = {
  note: string;
  Icon: LucideIcon;
  tone: string;
};

const evaluationMeta: Record<EvaluationScore, EvaluationMeta> = {
  ممتاز: { note: "إتقان راسخ", Icon: Sparkles, tone: "evaluation--excellent" },
  "جيد جداً": { note: "أداء متقدم", Icon: BadgeCheck, tone: "evaluation--very-good" },
  جيد: { note: "تقدم طيب", Icon: CircleCheck, tone: "evaluation--good" },
  إعادة: { note: "مراجعة مستحبة", Icon: RefreshCcw, tone: "evaluation--retry" },
};

export function EvaluationBadge({ score, compact = false, className = "" }: EvaluationBadgeProps) {
  const meta = evaluationMeta[score as EvaluationScore] ?? evaluationMeta["جيد"];
  const Icon = meta.Icon;

  return (
    <span className={`evaluation ${meta.tone} ${compact ? "evaluation--compact" : ""} ${className}`.trim()} aria-label={`التقييم: ${score}`}>
      <span className="evaluation__icon"><Icon size={compact ? 13 : 17} aria-hidden="true" /></span>
      <span className="evaluation__copy"><b>{score}</b>{!compact && <small>{meta.note}</small>}</span>
    </span>
  );
}
