import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowRight, BookOpenCheck, CalendarDays, Copy, ExternalLink, Link2, LogOut, Phone, RefreshCcw, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/BrandMark";
import { EvaluationBadge } from "@/components/EvaluationBadge";
import { getStudentProfile, signOutCurrentUser, type StudentProfile } from "@/lib/firebase";
import { arabicNumber, getSurah } from "@/lib/quran";

function formattedDate(date: string) {
  return new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export default function StudentProfilePage() {
  const [, setLocation] = useLocation();
  // Route params, not a manual path-split: wouter's `useLocation()` string alone can't tell
  // `/supervisor/halaqa/:halaqaId/student/:studentId` apart from any other segment count, and a
  // fixed-index split silently reads the wrong fields (this previously grabbed the literal word
  // "halaqa" as the halaqaId and the real halaqaId as the studentId) — every student profile page
  // this drove looked up a document that could never exist and always rendered "not found."
  const [, params] = useRoute<{ halaqaId: string; studentId: string }>("/supervisor/halaqa/:halaqaId/student/:studentId");
  const halaqaId = params?.halaqaId ?? "";
  const studentId = params?.studentId ?? "";
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    getStudentProfile(halaqaId, studentId).then((record) => {
      if (cancelled) return;
      setProfile(record);
      setNotFound(!record);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setProfile(null);
        setNotFound(true);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [halaqaId, studentId]);

  const publicUrl = profile && typeof window !== "undefined" ? `${window.location.origin}/p/${profile.publicId}` : "";
  const memorizationCount = profile?.sessions.filter((session) => session.kind === "memorization").length ?? 0;
  const reviewCount = profile?.sessions.filter((session) => session.kind === "review").length ?? 0;
  const lastSession = profile?.sessions[0];
  const latestSurah = lastSession ? getSurah(lastSession.surah).name : profile?.lastSurah;
  const performance = useMemo(() => {
    if (!profile?.sessions.length) return "—";
    const excellent = profile.sessions.filter((session) => session.evaluation === "ممتاز").length;
    return `${arabicNumber(Math.round((excellent / profile.sessions.length) * 100))}٪`;
  }, [profile]);

  const copyPublicLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("نُسخ رابط المتابعة العائلي.");
    } catch {
      toast.error("تعذّر نسخ الرابط تلقائياً.");
    }
  };

  return (
    <main className="app-shell supervisor-shell" dir="rtl">
      <aside className="app-sidebar">
        <BrandLockup compact />
        <div className="role-chip role-chip--super">مساحة المشرف</div>
        <nav className="side-nav" aria-label="تنقل المشرف">
          <button onClick={() => setLocation("/supervisor")}><UsersRound size={19} /> لوحة المتابعة</button>
          <button className="is-active" aria-current="page" onClick={() => setLocation(`/supervisor/halaqa/${halaqaId}`)}><UserRound size={19} /> الحلقات والطلاب</button>
          <button onClick={() => toast("قريباً: تقارير الإنجاز")}><BookOpenCheck size={19} /> التقارير</button>
        </nav>
        <div className="sidebar-user">
          <span className="avatar avatar--gold">م</span>
          <div><b>المشرف</b><small>صلاحيات كاملة</small></div>
          <button onClick={async () => { await signOutCurrentUser(); setLocation("/login"); }} aria-label="تسجيل الخروج"><LogOut size={18} /></button>
        </div>
      </aside>
      <section className="app-main student-profile-main">
        {loading && <div className="profile-state" role="status"><span className="route-gate__spinner" /> جارٍ تحميل ملف الطالب…</div>}
        {!loading && notFound && (
          <div className="profile-state profile-state--error">
            <UserRound size={28} />
            <h1>تعذّر العثور على ملف الطالب</h1>
            <p>قد يكون الرابط غير صحيح أو حُذف هذا الطالب.</p>
            <button className="back-to-dashboard" onClick={() => setLocation(`/supervisor/halaqa/${halaqaId}`)}><ArrowRight size={17} /> العودة إلى الحلقة</button>
          </div>
        )}
        {!loading && profile && <>
          <header className="app-topbar profile-topbar">
            <div>
              <button className="back-to-dashboard" onClick={() => setLocation(`/supervisor/halaqa/${profile.halaqaId}`)}><ArrowRight size={17} /> العودة إلى {profile.halaqaName}</button>
              <p className="section-kicker">ملف الطالب</p>
              <h1>{profile.name}</h1>
              <p className="page-subtitle"><UsersRound size={15} /> {profile.halaqaName} <span>·</span> {profile.teacherName}</p>
            </div>
            <span className="secure-status"><ShieldCheck size={17} /> عرض المشرف</span>
          </header>

          <section className="student-profile-hero">
            <div className="profile-identity">
              <span className="profile-avatar">{profile.name.split(" ").slice(0, 2).map((part) => part[0]).join(" ")}</span>
              <div><p className="section-kicker">بطاقة الطالب</p><h2>{profile.name}</h2><p>{profile.age ? `${arabicNumber(profile.age)} سنة` : "العمر غير مسجل"} <span>·</span> {profile.teacherName}</p></div>
            </div>
            <div className="profile-link-box">
              <div><span><Link2 size={15} /> رابط العائلة</span><b>سجل متابعة خاص</b></div>
              <button onClick={() => void copyPublicLink()}><Copy size={16} /> نسخ الرابط</button>
              <a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> فتح</a>
            </div>
          </section>

          <section className="profile-stats" aria-label="ملخص ملف الطالب">
            <article><span className="detail-stat-icon detail-stat-icon--gold"><BookOpenCheck size={18} /></span><div><b>{arabicNumber(memorizationCount)}</b><small>جلسات حفظ ظاهرة</small></div></article>
            <article><span className="detail-stat-icon detail-stat-icon--sage"><RefreshCcw size={18} /></span><div><b>{arabicNumber(reviewCount)}</b><small>جلسات مراجعة ظاهرة</small></div></article>
            <article><span className="detail-stat-icon detail-stat-icon--clay"><CalendarDays size={18} /></span><div><b>{lastSession ? formattedDate(lastSession.date) : "—"}</b><small>آخر متابعة</small></div></article>
            <article><span className="detail-stat-icon detail-stat-icon--ink"><ShieldCheck size={18} /></span><div><b>{performance}</b><small>نسبة تقييم ممتاز</small></div></article>
          </section>

          <section className="profile-grid">
            <article className="profile-info-card">
              <div className="section-title-row"><div><p className="section-kicker">معلومات التواصل</p><h2>بيانات يحتاجها المشرف</h2></div><UserRound size={21} /></div>
              <dl>
                <div><dt><Phone size={15} /> هاتف ولي الأمر</dt><dd>{profile.phone ? `${profile.phone}${profile.phoneRelation ? ` · ${profile.phoneRelation}` : ""}` : "غير مسجل"}</dd></div>
                <div><dt><BookOpenCheck size={15} /> آخر موضع محفوظ</dt><dd>{latestSurah ? `${latestSurah}${profile.lastRange ? ` · ${profile.lastRange}` : ""}` : "لم تسجل قراءة بعد"}</dd></div>
                <div><dt><CalendarDays size={15} /> ملاحظة السجل</dt><dd>{profile.readingNote || "لا توجد ملاحظة إضافية."}</dd></div>
              </dl>
            </article>
            <article className="profile-focus-card">
              <p className="section-kicker">مؤشر المتابعة</p>
              <h2>{lastSession ? `آخر تقييم: ${lastSession.evaluation}` : "بانتظار أول جلسة"}</h2>
              <p>{lastSession ? `آخر جلسة كانت في ${formattedDate(lastSession.date)}، وتم تسجيل ${getSurah(lastSession.surah).name} من الآية ${arabicNumber(lastSession.ayahFrom)} إلى ${arabicNumber(lastSession.ayahTo)}.` : "يمكن للمعلم تسجيل أول جلسة من مساحة الحلقة."}</p>
              {lastSession && <EvaluationBadge score={lastSession.evaluation} />}
            </article>
          </section>

          <section className="profile-history detail-section">
            <div className="section-title-row"><div><p className="section-kicker">السجل التفصيلي</p><h2>جلسات الطالب</h2></div><span className="record-count"><CalendarDays size={13} /> {arabicNumber(profile.sessions.length)} جلسة</span></div>
            {profile.sessions.length ? (
              <div className="profile-history-list">
                {profile.sessions.map((session) => (
                  <div className="profile-history-row" key={session.id}>
                    <span className={`detail-session-icon ${session.kind === "review" ? "detail-session-icon--sage" : ""}`}>{session.kind === "review" ? <RefreshCcw size={17} /> : <BookOpenCheck size={17} />}</span>
                    <span><b>{session.kind === "review" ? "مراجعة" : "حفظ جديد"} · سورة {getSurah(session.surah).name}</b><small>{formattedDate(session.date)} · الآيات {arabicNumber(session.ayahFrom)} — {arabicNumber(session.ayahTo)}{session.reviewNote ? ` · ${session.reviewNote}` : ""}</small></span>
                    <EvaluationBadge score={session.evaluation} compact />
                  </div>
                ))}
              </div>
            ) : <div className="profile-empty"><CalendarDays size={24} /><p>لا توجد جلسات مسجلة لهذا الطالب بعد.</p></div>}
          </section>
        </>}
      </section>
    </main>
  );
}
