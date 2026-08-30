import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, BookOpenCheck, BookOpenText, CalendarDays, ChevronLeft, ChevronRight,
  Clock3, ClipboardPenLine, Crown, Flame, Link2, LockKeyhole, QrCode, Sparkles, Target, UsersRound, type LucideIcon,
} from "lucide-react";
import { AchievementCard } from "@/components/AchievementCard";
import { AchievementIcon, type AchievementIconName } from "@/components/AchievementIcon";
import { BrandLockup, BrandMark, MAQRAA_NAME_VOWELED } from "@/components/BrandMark";
import { EvaluationBadge } from "@/components/EvaluationBadge";
import { StreakBadge } from "@/components/StreakBadge";
import { arabicNumber, getSurah, SURAH_LIST } from "@/lib/quran";
import { ENVY_HADITH, pickRandomDhikr } from "@/lib/dhikr";
import { fetchPublicSession, isDemoMode, type PublicSession, type PublicStudent, watchPublicStudent } from "@/lib/firebase";

const greetings = [
  "يا حامل القرآن، خطوة اليوم تصنع نور الغد.",
  "بارك الله في همّتك؛ كل آية تحفظها صحبة لا تزول.",
  "مسيرتك هادئة وثابتة، والمقصد أجمل بإذن الله.",
];

const hadithGreeting = ENVY_HADITH.text;

type AchievementCategory = "beginning" | "consistency" | "memorization" | "mastery" | "bonus";
type AchievementDef = {
  id: string;
  category: AchievementCategory;
  icon: AchievementIconName;
  title: string;
  description: string;
  target: number;
  value: number;
  unit: string;
  certificationRequired?: boolean;
};
type AchievementTab = { id: "all" | AchievementCategory; label: string; Icon: LucideIcon };

const achievementTabs: AchievementTab[] = [
  { id: "all", label: "المسار الكامل", Icon: Sparkles },
  { id: "beginning", label: "البداية", Icon: Target },
  { id: "consistency", label: "الاستمرارية", Icon: Flame },
  { id: "memorization", label: "محطات الحفظ", Icon: BookOpenCheck },
  { id: "mastery", label: "التثبيت والإتقان", Icon: Crown },
  { id: "bonus", label: "أوسمة إضافية", Icon: CalendarDays },
];

/** Real per-student aggregates the achievement grid is built from — some (streak, sessionsCount,
 * reviewCount, completedParts) come straight off the rollup document; the rest are derived from the
 * most recent ~30 prefetched sessions rather than a full lifetime history, to keep an anonymous public
 * page cheap to load. That's an honest, disclosed tradeoff, not a hidden approximation: it means a very
 * long-running student's older sessions don't count toward "completed surahs" or "excellent streak" —
 * far better than the alternative of numbers that never reflected the student at all. */
function buildAchievements(student: PublicStudent, recentSessions: PublicSession[]): AchievementDef[] {
  const excellentCount = recentSessions.filter((session) => session.evaluation === "ممتاز").length;
  const completedSurahIds = new Set(
    recentSessions.filter((session) => session.ayahTo >= getSurah(session.surah).ayahs).map((session) => session.surah),
  );
  let consecutiveExcellent = 0;
  for (const session of recentSessions) {
    if (session.evaluation !== "ممتاز") break;
    consecutiveExcellent += 1;
  }

  const def = (id: string, category: AchievementCategory, icon: AchievementIconName, title: string, description: string, target: number, value: number, unit: string, certificationRequired?: boolean): AchievementDef =>
    ({ id, category, icon, title, description, target, value, unit, certificationRequired });

  return [
    def("first-step", "beginning", "target", "خطوة مباركة", "سجّلت هدفك وبدأت مسيرة الحفظ بعزم جميل.", 1, 1, "بداية المسيرة"),
    def("first-session", "beginning", "spark", "أول جلسة", "أتممت أول جلسة تسميع مع معلّمك.", 1, student.sessionsCount, "جلسة"),
    def("first-surah", "beginning", "book", "أول سورة", "أتممت حفظ أول سورة في رحلتك المباركة.", 1, completedSurahIds.size, "سورة"),
    def("first-week", "beginning", "calendar", "أسبوع من النور", "حافظت على الحضور والتسميع سبعة أيام متتالية.", 7, student.streak, "يوماً"),
    def("companion", "beginning", "spark", "رفيق الحلقة", "أصبحت جزءاً ثابتاً من رحلة الحلقة بإتمام عشر جلسات.", 10, student.sessionsCount, "جلسة"),
    def("two-weeks", "consistency", "calendar", "أسبوعان من الثبات", "واصل الأيام القادمة لتكمل أسبوعين متتاليين.", 14, student.streak, "يوماً"),
    def("thirty-days", "consistency", "flame", "ثلاثون يوماً مع القرآن", "اجعل القرآن رفيقاً حاضراً في أيامك ثلاثين يوماً.", 30, student.streak, "يوماً"),
    def("twenty-five-sessions", "consistency", "spark", "خمس وعشرون جلسة", "أتممت خمساً وعشرين جلسة تسميع مع الحلقة.", 25, student.sessionsCount, "جلسة"),
    def("first-review", "consistency", "target", "مراجعة مباركة", "أتمم أول مراجعة منظمة لما حفظته مع معلّمك.", 1, student.reviewCount, "مراجعة"),
    def("fifty-sessions", "consistency", "spark", "خمسون جلسة", "أتمم خمسين محطة من العمل الهادئ.", 50, student.sessionsCount, "جلسة"),
    def("one-part", "memorization", "book", "بداية الجزء", "أتممت أول جزء من رحلتك مع كتاب الله.", 1, student.completedParts, "جزءاً"),
    def("five-parts", "memorization", "book", "خمسة أجزاء", "أصبح لك رصيد مبارك من خمسة أجزاء محفوظة.", 5, student.completedParts, "أجزاء"),
    def("ten-parts", "memorization", "book", "عشرة أجزاء", "قطعت ثلث الطريق بإصرار جميل.", 10, student.completedParts, "أجزاء"),
    def("halfway", "memorization", "crown", "نصف الطريق", "أكمل الأجزاء القادمة لتصل إلى منتصف المسيرة.", 15, student.completedParts, "جزءاً"),
    def("twenty-parts", "memorization", "crown", "عشرون جزءاً", "اقتربت من تمام الحفظ؛ واصل بنفس الهمة.", 20, student.completedParts, "جزءاً"),
    def("twenty-five-parts", "memorization", "crown", "خمسة وعشرون جزءاً", "اقتربت من تمام الحفظ، فلا تتوقف الآن.", 25, student.completedParts, "جزءاً"),
    def("complete-memorization", "memorization", "crown", "ختم الحفظ", "أتممت حفظ الأجزاء الثلاثين وبدأت مرحلة التثبيت.", 30, student.completedParts, "جزءاً"),
    def("masterful-voice", "mastery", "spark", "صوت متقن", "احصل على تقييم ممتاز في خمس جلسات متتالية.", 5, consecutiveExcellent, "جلسات"),
    def("complete-review", "mastery", "target", "مراجعة شاملة", "أتمم مراجعة جميع الأجزاء المحفوظة مرة كاملة.", 1, 0, "من المراجعة", true),
    def("review-cycle", "mastery", "crown", "ختمة تثبيت", "أتمم دورة مراجعة كاملة بإشراف المعلّم.", 1, 0, "لم تبدأ بعد", true),
    def("mastery-crown", "mastery", "crown", "تاج الإتقان", "أتمم الحفظ والمراجعة النهائية باعتماد المعلّم أو المشرف.", 1, 0, "يتطلب اعتماداً", true),
    def("quran-bearer", "mastery", "book", "حامل القرآن", "اعتماد إتمام الحفظ والتثبيت من المقرأة.", 1, 0, "إنجاز ختامي", true),
    def("sixty-days", "bonus", "calendar", "حضور لا ينقطع", "التزم بالحضور لمدة ستين يوماً.", 60, student.streak, "يوماً"),
    def("hundred-sessions", "bonus", "spark", "مئة جلسة", "أتمم مئة جلسة تسميع مع الحلقة.", 100, student.sessionsCount, "جلسة"),
    def("review-companion", "bonus", "target", "مراجع أمين", "أتمم مراجعات منتظمة دون انقطاع.", 30, student.reviewCount, "مراجعة"),
    def("mastery-companion", "bonus", "spark", "رفيق الإتقان", "احصل على عشر تقييمات ممتازة.", 10, excellentCount, "تقييمات"),
    def("ten-surahs", "bonus", "book", "عشر سور مضيئة", "أتمم حفظ عشر سور كاملة.", 10, completedSurahIds.size, "سور"),
    def("fifty-surahs", "bonus", "book", "خمسون سورة", "أتمم حفظ خمسين سورة.", 50, completedSurahIds.size, "سورة"),
    def("hundred-surahs", "bonus", "book", "مئة سورة", "أتمم حفظ مئة سورة.", 100, completedSurahIds.size, "سورة"),
    def("all-surahs", "bonus", "crown", "تمام السور", "أتمم حفظ سور القرآن الكريم كاملة.", SURAH_LIST.length, completedSurahIds.size, "سورة"),
  ];
}

function formattedDate(date: string, islamic = false) {
  return new Intl.DateTimeFormat(islamic ? "ar-SA-u-ca-islamic" : "ar-SA", {
    weekday: islamic ? undefined : "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function sessionLine(session: PublicSession | null | undefined, kind: "current" | "next") {
  if (!session) return { surahName: "—", range: "—" };
  const surah = getSurah(kind === "current" ? session.surah : session.nextSurah);
  const from = kind === "current" ? session.ayahFrom : session.nextAyahFrom;
  const to = kind === "current" ? session.ayahTo : session.nextAyahTo;
  return { surahName: `سورة ${surah.name}`, range: `من الآية ${arabicNumber(from)} إلى الآية ${arabicNumber(to)}` };
}

function HeroSkeleton() {
  return (
    <main className="public-page" dir="rtl">
      <section className="public-hero skeleton-hero" aria-hidden="true">
        <div className="public-hero__image" />
        <div className="public-hero__veil" />
      </section>
      <section className="public-content"><div className="public-container">
        <div className="skeleton-block" style={{ height: 120, marginBottom: 22 }} />
        <div className="skeleton-block" style={{ height: 280 }} />
      </div></section>
    </main>
  );
}

/**
 * The bare, no-publicId landing ("/") — anyone typing the domain directly, without a family's own
 * link, ends up here. Manus's original design filled this exact case with fabricated demo data
 * (a fake student, fake sessions, fake achievements) presented as if it were real; we deliberately
 * don't do that — a family could be misled into thinking it's their child's real record. This gives
 * the page the same visual weight as the rest of the site (hero + a real explanation of how the
 * system works) using only honest, non-student-specific content instead.
 */
function PublicLandingPage() {
  const [, setLocation] = useLocation();
  const features: Array<{ icon: LucideIcon; tone: "gold" | "sage" | "clay"; title: string; body: string }> = [
    { icon: QrCode, tone: "gold", title: "رابط خاص لكل طالب", body: "يحصل كل طالب على رابط ورمز QR خاصين به، يُسلَّمان لأسرته من المعلّم أو المشرف." },
    { icon: ClipboardPenLine, tone: "sage", title: "تسجيل التسميع أولاً بأول", body: "يسجّل المعلّم كل جلسة تسميع ومراجعة مباشرة بعد انتهائها، بالسورة والآيات والتقييم." },
    { icon: UsersRound, tone: "clay", title: "متابعة أسرية يومية", body: "تتابع الأسرة تقدّم ابنها لحظة بلحظة من رابطها الخاص، دون حاجة لحساب أو تطبيق." },
  ];
  return (
    <main className="public-page" dir="rtl">
      <section className="public-hero" style={{ minHeight: "46vh" }}>
        <div className="public-hero__image" aria-hidden="true" />
        <div className="public-hero__veil" aria-hidden="true" />
        <div className="public-hero__grain" aria-hidden="true" />
        <header className="public-nav maq-reveal maq-delay-1">
          <BrandLockup className="brand-lockup--light" />
          <button className="public-nav__admin" onClick={() => setLocation("/login")}>
            <LockKeyhole size={15} /> بوابة الإدارة
          </button>
        </header>
        <div className="public-hero__content maq-reveal maq-delay-2">
          <div className="eyebrow-light"><span /> منصة متابعة الحفظ <span /></div>
          <p className="public-hero__greeting"><Sparkles size={18} /><span>{hadithGreeting}<a className="hadith-source" href="https://sunnah.com/bukhari:1409" target="_blank" rel="noreferrer">المصدر: صحيح البخاري، حديث ١٤٠٩</a></span></p>
        </div>
      </section>

      <section className="public-content"><div className="public-container">
        <div className="session-paper state-card maq-reveal">
          <div className="state-card__icon"><Link2 size={26} /></div>
          <h3>هذا رابط عام لمقرأة عبد الله بن عباس رضي الله عنهما</h3>
          <p>لعرض سجل حفظ طالب معيّن تحتاج إلى رابطه الخاص الذي تستلمه أسرته من المعلّم أو المشرف. إن كنت من فريق المقرأة يمكنك الدخول من هنا.</p>
          <button className="form-submit" onClick={() => setLocation("/login")}>دخول الإدارة <ArrowLeft size={16} /></button>
        </div>

        <section className="public-landing-features maq-reveal" aria-label="كيف تعمل المنصة">
          {features.map((feature) => (
            <article className="public-landing-feature" key={feature.title}>
              <span className={`detail-stat-icon detail-stat-icon--${feature.tone}`}><feature.icon size={20} /></span>
              <h4>{feature.title}</h4>
              <p>{feature.body}</p>
            </article>
          ))}
        </section>
      </div></section>

      <footer className="public-footer">{MAQRAA_NAME_VOWELED} <span>·</span> <a href="/login">دخول الإدارة</a></footer>
    </main>
  );
}

function StateScreen({ icon, title, message, ctaLabel, ctaHref }: { icon: React.ReactNode; title: string; message: string; ctaLabel?: string; ctaHref?: string }) {
  const [, setLocation] = useLocation();
  return (
    <main className="public-page" dir="rtl">
      <section className="public-hero" style={{ minHeight: "40vh" }}>
        <div className="public-hero__image" aria-hidden="true" />
        <div className="public-hero__veil" aria-hidden="true" />
        <header className="public-nav maq-reveal"><BrandLockup className="brand-lockup--light" /></header>
      </section>
      <section className="public-content"><div className="public-container">
        <div className="session-paper state-card maq-reveal">
          <div className="state-card__icon">{icon}</div>
          <h3>{title}</h3>
          <p>{message}</p>
          {ctaLabel && ctaHref && (
            <button className="form-submit" onClick={() => setLocation(ctaHref)}>{ctaLabel} <ArrowLeft size={16} /></button>
          )}
        </div>
      </div></section>
      <footer className="public-footer">{MAQRAA_NAME_VOWELED} <span>·</span> <a href="/login">دخول الإدارة</a></footer>
    </main>
  );
}

export default function StudentPublicPage() {
  const params = useParams<{ publicId?: string }>();
  const publicId = params.publicId;
  const [, setLocation] = useLocation();

  const [loading, setLoading] = useState(Boolean(publicId));
  const [student, setStudent] = useState<PublicStudent | null | undefined>(undefined); // undefined = not loaded yet
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, PublicSession>>({});
  const [sessionLoading, setSessionLoading] = useState(false);
  const [activeAchievementCategory, setActiveAchievementCategory] = useState<"all" | AchievementCategory>("all");

  const historyDates = useMemo(() => {
    // Defensive: a hand-edited or partially-migrated Firestore doc could be missing this field
    // entirely (the normal write path via applyRollupDelta always includes it as an array, but
    // nothing stops a malformed doc from reaching the client) — fall back to empty rather than
    // crashing the whole public page on `[...undefined]`.
    if (!student || !Array.isArray(student.sessionDates)) return [];
    return [...student.sessionDates].sort().reverse().slice(0, 30);
  }, [student]);

  // Live subscription to the student's public rollup.
  useEffect(() => {
    if (!publicId || isDemoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = watchPublicStudent(publicId, (data) => {
      setStudent(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [publicId]);

  // Default to the most recent date once the student loads.
  useEffect(() => {
    if (historyDates.length > 0 && !selectedDate) setSelectedDate(historyDates[0]);
  }, [historyDates, selectedDate]);

  // Prefetch the recent history's session details — also what the achievement grid's real-data
  // metrics (excellent count, completed surahs, excellent streak) are computed from below.
  useEffect(() => {
    if (!publicId || historyDates.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = historyDates.filter((date) => !sessionsByDate[date]);
      if (missing.length === 0) return;
      const results = await Promise.all(missing.map((date) => fetchPublicSession(publicId, date)));
      if (cancelled) return;
      setSessionsByDate((current) => {
        const next = { ...current };
        missing.forEach((date, index) => { if (results[index]) next[date] = results[index]!; });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [publicId, historyDates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch on-demand when the date picker jumps outside the prefetched window.
  useEffect(() => {
    if (!publicId || !selectedDate || sessionsByDate[selectedDate]) return;
    setSessionLoading(true);
    fetchPublicSession(publicId, selectedDate).then((data) => {
      setSessionLoading(false);
      if (data) setSessionsByDate((current) => ({ ...current, [selectedDate]: data }));
    });
  }, [publicId, selectedDate, sessionsByDate]);

  const greeting = useMemo(() => greetings[new Date().getDate() % greetings.length], []);
  const currentIndex = historyDates.indexOf(selectedDate);
  const activeSession = sessionsByDate[selectedDate];
  const moveSession = (step: number) => {
    const nextIndex = currentIndex + step;
    if (historyDates[nextIndex]) setSelectedDate(historyDates[nextIndex]);
  };

  const recentSessionsInOrder = useMemo(
    () => historyDates.map((date) => sessionsByDate[date]).filter((session): session is PublicSession => Boolean(session)),
    [historyDates, sessionsByDate],
  );
  const achievements = useMemo(() => (student ? buildAchievements(student, recentSessionsInOrder) : []), [student, recentSessionsInOrder]);
  const visibleAchievements = activeAchievementCategory === "all" ? achievements : achievements.filter((item) => item.category === activeAchievementCategory);
  const completedCount = achievements.filter((item) => !item.certificationRequired && item.value >= item.target).length;
  const nextGoal = achievements.find((item) => !item.certificationRequired && item.value < item.target);

  if (!publicId) {
    return <PublicLandingPage />;
  }

  if (isDemoMode) {
    return (
      <StateScreen
        icon={<LockKeyhole size={24} />}
        title="الاتصال بقاعدة البيانات غير مُهيّأ"
        message="لم يتم ضبط إعدادات Firebase لهذا الموقع بعد، فلا يمكن عرض بيانات الطالب الحقيقية."
      />
    );
  }

  if (loading || student === undefined) return <HeroSkeleton />;

  if (student === null) {
    return (
      <StateScreen
        icon={<BookOpenText size={24} />}
        title="تعذّر العثور على ملف الطالب"
        message="قد يكون الرابط غير صحيح أو منتهياً، أو لم تُستورد بيانات هذا الطالب بعد من قبل المشرف. تواصل مع المقرأة للتأكد من الرابط."
        ctaLabel="دخول الإدارة"
        ctaHref="/login"
      />
    );
  }

  return (
    <main className="public-page" dir="rtl">
      <section className="public-hero">
        <div className="public-hero__image" aria-hidden="true" />
        <div className="public-hero__veil" aria-hidden="true" />
        <div className="public-hero__grain" aria-hidden="true" />
        <header className="public-nav maq-reveal maq-delay-1">
          <BrandLockup className="brand-lockup--light" />
          <button className="public-nav__admin" onClick={() => setLocation("/login")}>
            <LockKeyhole size={15} /> بوابة الإدارة
          </button>
        </header>

        <div className="public-hero__content maq-reveal maq-delay-2">
          <div className="eyebrow-light"><span /> سجل متابعة الحفظ <span /></div>
          <h1>{student.name}</h1>
          <p className="public-hero__halaqa">{student.halaqaName}</p>
          <p className="public-hero__greeting"><Sparkles size={18} /><span>{hadithGreeting}<a className="hadith-source" href="https://sunnah.com/bukhari:1409" target="_blank" rel="noreferrer">المصدر: صحيح البخاري، حديث ١٤٠٩</a></span></p>
          {historyDates.length > 0 && (
            <button className="hero-cta" onClick={() => document.getElementById("today-session")?.scrollIntoView({ behavior: "smooth" })}>
              عرض جلسة اليوم <ArrowLeft size={18} />
            </button>
          )}
        </div>

        <div className="public-hero__footer maq-reveal maq-delay-3">
          <span className="live-pill"><i /> تحديث مباشر</span>
          <span>آخر تحديث: الآن</span>
        </div>
      </section>

      <section className="public-content" id="today-session">
        <div className="public-content__pattern" aria-hidden="true" />
        <div className="public-container">
          <div className="private-note maq-reveal">
            <LockKeyhole size={15} /> هذا الرابط خاص بسجل {student.name} وعائلته
          </div>

          <div className="progress-head maq-reveal maq-delay-1">
            <div>
              <p className="section-kicker">مسيرته حتى اليوم</p>
              <h2>حفظٌ يُبنى آيةً آية</h2>
            </div>
            <div className="progress-orbit" aria-label={`${arabicNumber(student.completedParts)} من ٣٠ جزءاً محفوظاً`}>
              <svg viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="25" />
                <circle
                  className="progress-orbit__fill"
                  cx="32" cy="32" r="25"
                  style={{ strokeDashoffset: 157 - (157 * Math.min(student.completedParts, 30)) / 30 }}
                />
              </svg>
              <strong>{arabicNumber(student.completedParts)}<small>/ ٣٠</small></strong>
            </div>
          </div>

          <section className="achievement-hero maq-reveal maq-delay-2" aria-labelledby="achievement-heading">
            <div className="achievement-hero__copy">
              <p className="achievement-hero__eyebrow"><Sparkles size={14} /> رحلة الإنجاز</p>
              <h2 id="achievement-heading">كل يوم يُقرّبك من الإتقان</h2>
              <p>الاستمرارية لا تُقاس بسرعة الخطوات، بل بجمال العودة كل يوم.</p>
              <div className="achievement-hero__goal">
                <div><span>الإنجاز القادم</span><b>{nextGoal ? nextGoal.title : "أتممت المسار الأساسي!"}</b></div>
                <strong>{nextGoal ? `${Math.round(Math.min(nextGoal.value / nextGoal.target, 1) * 100)}٪` : "١٠٠٪"}</strong>
              </div>
              <div className="achievement-hero__track"><i style={{ width: nextGoal ? `${Math.round(Math.min(nextGoal.value / nextGoal.target, 1) * 100)}%` : "100%" }} /></div>
            </div>
            <div className="achievement-hero__seal">
              <AchievementIcon name="flame" size={126} className="achievement-hero__flame" />
              <div className="achievement-hero__seal-badge">
                <StreakBadge days={student.streak} compact showCount={false} />
                <strong>{student.streak > 0 ? "سلسلة نشطة" : "ابدأ سلسلتك"}</strong>
                <span>{student.streak > 0 ? "استمر غداً" : "سجّل اليوم"}</span>
              </div>
            </div>
          </section>

          <div className="stats-grid maq-reveal maq-delay-2">
            <article className="soft-stat soft-stat--streak"><AchievementIcon name="flame" size={38} /><div><b>{arabicNumber(student.streak)}</b><p>أيام متتالية</p></div></article>
            <article className="soft-stat"><AchievementIcon name="spark" size={38} /><div><b>{arabicNumber(student.sessionsCount)}</b><p>جلسة مكتملة</p></div></article>
            <article className="soft-stat"><AchievementIcon name="book" size={38} /><div><b>{arabicNumber(student.completedParts)}</b><p>جزءاً محفوظاً</p></div></article>
          </div>

          <section className="achievements-section maq-reveal maq-delay-3" aria-labelledby="achievements-title">
            <div className="achievements-section__head">
              <div><p className="section-kicker">من البداية حتى الإتقان</p><h2 id="achievements-title">لائحة الإنجازات</h2></div>
              <span>{arabicNumber(completedCount)} من {arabicNumber(achievements.filter((item) => !item.certificationRequired).length)} مكتملة</span>
            </div>
            <div className="achievement-tabs" role="tablist" aria-label="تصنيف الإنجازات">
              {achievementTabs.map(({ id, label, Icon }) => (
                <button key={id} type="button" role="tab" aria-selected={activeAchievementCategory === id} className={activeAchievementCategory === id ? "is-active" : ""} onClick={() => setActiveAchievementCategory(id)}><Icon size={15} /> {label}</button>
              ))}
            </div>
            <div className="achievement-grid">
              {visibleAchievements.map((item) => (
                <AchievementCard
                  key={item.id}
                  icon={item.icon}
                  title={item.title}
                  description={item.description}
                  meta={item.certificationRequired ? item.unit : `${arabicNumber(Math.min(item.value, item.target))} من ${arabicNumber(item.target)} ${item.unit}`}
                  progress={item.certificationRequired ? 0 : Math.round(Math.min(item.value / item.target, 1) * 100)}
                  unlocked={!item.certificationRequired && item.value >= item.target}
                />
              ))}
            </div>
          </section>

          {historyDates.length === 0 ? (
            <div className="session-paper state-card maq-reveal maq-delay-3">
              <div className="state-card__icon"><Clock3 size={22} /></div>
              <h3>لم تُسجَّل أي جلسة بعد</h3>
              <p>سيظهر هنا آخر ما قرأه {student.name} فور تسجيل المعلّم لأول جلسة تسميع.</p>
            </div>
          ) : (
            <>
              <div className="session-navigation maq-reveal maq-delay-2" aria-label="التنقل بين الجلسات">
                <button aria-label="الجلسة الأقدم" onClick={() => moveSession(1)} disabled={!historyDates[currentIndex + 1]}><ChevronRight size={20} /></button>
                <label>
                  <CalendarDays size={17} />
                  <span><strong>{selectedDate ? formattedDate(selectedDate) : "—"}</strong><small>{selectedDate ? `${formattedDate(selectedDate, true)} هـ` : ""}</small></span>
                  <input
                    type="date"
                    value={selectedDate}
                    min={historyDates[historyDates.length - 1]}
                    max={historyDates[0]}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    aria-label="اختيار تاريخ الجلسة"
                  />
                </label>
                <button aria-label="الجلسة الأحدث" onClick={() => moveSession(-1)} disabled={!historyDates[currentIndex - 1]}><ChevronLeft size={20} /></button>
              </div>

              {sessionLoading && !activeSession ? (
                <div className="skeleton-block" style={{ height: 300 }} />
              ) : activeSession ? (
                <article className="session-paper maq-reveal maq-delay-3" key={selectedDate}>
                  <header className="session-paper__header">
                    <div><p>جلسة التسميع</p><h3>{activeSession.kind === "review" ? "ما راجعه اليوم" : "ما قرأه اليوم"}</h3></div>
                    <EvaluationBadge score={activeSession.evaluation} />
                  </header>
                  <div className="session-read">
                    <span className="session-read__label"><BookOpenCheck size={14} aria-hidden="true" /> التلاوة</span>
                    <h4>{sessionLine(activeSession, "current").surahName}</h4>
                    <p>{sessionLine(activeSession, "current").range}</p>
                    {activeSession.reviewNote && <span className="teacher-note"><Clock3 size={15} /> {activeSession.reviewNote}</span>}
                  </div>
                  <div className="next-memory">
                    <div className="next-memory__icon"><BrandMark size={32} /></div>
                    <div>
                      <p>المطلوب للمرة القادمة</p>
                      <h4>{sessionLine(activeSession, "next").surahName}</h4>
                      <strong>{sessionLine(activeSession, "next").range}</strong>
                    </div>
                    <ArrowLeft className="next-memory__arrow" size={22} />
                  </div>
                </article>
              ) : (
                <div className="session-paper state-card"><p>تعذّر تحميل تفاصيل هذه الجلسة.</p></div>
              )}

              <section className="history-section maq-reveal maq-delay-3">
                <div className="history-section__head"><div><p className="section-kicker">أيام مضت</p><h2>سجل الجلسات</h2></div><span>{arabicNumber(historyDates.length)} جلسات ظاهرة</span></div>
                <div className="history-list">
                  {historyDates.map((date, index) => {
                    const item = sessionsByDate[date];
                    return (
                      <button className={`history-row ${date === selectedDate ? "is-selected" : ""}`} onClick={() => setSelectedDate(date)} key={date}>
                        <span className="history-row__order">{arabicNumber(index + 1)}</span>
                        <span className="history-row__date">{formattedDate(date)}</span>
                        <span><b>{item ? sessionLine(item, "current").surahName : "…"}</b><small>{item ? sessionLine(item, "current").range : ""}</small></span>
                        <span className="history-row__grade">{item?.evaluation ?? ""}</span>
                        <ArrowLeft size={17} />
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </section>
      <footer className="public-footer">{MAQRAA_NAME_VOWELED} <span>·</span> <a href="/login">دخول الإدارة</a></footer>
    </main>
  );
}
