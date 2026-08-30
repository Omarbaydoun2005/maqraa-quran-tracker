import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { BookOpenCheck, CalendarDays, ChevronLeft, ClipboardPenLine, LayoutDashboard, Loader2, LogOut, RefreshCcw, Sparkles, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/BrandMark";
import { EvaluationBadge } from "@/components/EvaluationBadge";
import { getSurah, SURAH_LIST } from "@/lib/quran";
import { pickRandomDhikr, TEACHER_HADITH } from "@/lib/dhikr";
import {
  type Evaluation, fetchCurrentUserProfile, getHalaqa, getLatestSession, type Halaqa,
  isDemoMode, listSessions, listStudents, saveSession, deleteSession, type Session, type SessionKind,
  signOutCurrentUser, type Student, watchAuthState,
} from "@/lib/firebase";

const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({
  date: todayIso(), surah: "1", from: "1", to: "1", grade: "ممتاز" as Evaluation, kind: "memorization" as SessionKind,
  nextSurah: "1", nextFrom: "1", nextTo: "1", reviewNote: "",
});
const ayahOptions = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

export default function TeacherDashboard() {
  const [, setLocation] = useLocation();
  const [authChecked, setAuthChecked] = useState(isDemoMode);
  const [profile, setProfile] = useState<{ uid: string; halaqaId?: string; username: string } | null>(null);
  const [halaqa, setHalaqa] = useState<Halaqa | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [lastSessionByStudent, setLastSessionByStudent] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState<{ sessionId: string; createdBy: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dhikr] = useState(pickRandomDhikr);

  useEffect(() => {
    if (isDemoMode) return;
    return watchAuthState(async (user) => {
      if (!user) { setLocation("/login"); return; }
      const p = await fetchCurrentUserProfile(user.uid);
      if (!p || p.role !== "teacher" || !p.halaqaId) {
        await signOutCurrentUser();
        setLocation("/login");
        return;
      }
      setProfile(p);
      setAuthChecked(true);
    });
  }, [setLocation]);

  useEffect(() => {
    if (!profile?.halaqaId) return;
    let cancelled = false;
    setLoadingStudents(true);
    Promise.all([getHalaqa(profile.halaqaId), listStudents(profile.halaqaId)]).then(([h, s]) => {
      if (cancelled) return;
      setHalaqa(h);
      setStudents(s);
      setSelectedStudentId((current) => current || s[0]?.id || "");
      setLoadingStudents(false);
    });
    return () => { cancelled = true; };
  }, [profile?.halaqaId]);

  useEffect(() => {
    if (!profile?.halaqaId || students.length === 0) return;
    let cancelled = false;
    Promise.all(students.map(async (s) => {
      const latest = await getLatestSession(profile.halaqaId!, s.id);
      return [s.id, latest?.date ?? ""] as const;
    })).then((entries) => {
      if (cancelled) return;
      setLastSessionByStudent(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [profile?.halaqaId, students]);

  useEffect(() => {
    if (!profile?.halaqaId || !selectedStudentId) return;
    listSessions(profile.halaqaId, selectedStudentId).then(setSessions);
  }, [profile?.halaqaId, selectedStudentId]);

  const selectedStudent = useMemo(() => students.find((s) => s.id === selectedStudentId), [students, selectedStudentId]);
  const selectedSurah = getSurah(form.surah);
  const nextSurah = getSurah(form.nextSurah);
  const reviewSessions = useMemo(() => sessions.filter((session) => session.kind === "review"), [sessions]);
  const memorizationSessions = useMemo(() => sessions.filter((session) => session.kind === "memorization"), [sessions]);

  const updateForm = <K extends keyof ReturnType<typeof emptyForm>>(field: K, value: ReturnType<typeof emptyForm>[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  const startEdit = (session: Session) => {
    setForm({
      date: session.date, surah: String(session.surah), from: String(session.ayahFrom), to: String(session.ayahTo),
      grade: session.evaluation, kind: session.kind, nextSurah: String(session.nextSurah),
      nextFrom: String(session.nextAyahFrom), nextTo: String(session.nextAyahTo), reviewNote: session.reviewNote ?? "",
    });
    setEditing({ sessionId: session.id, createdBy: session.createdBy });
    document.getElementById("record-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const cancelEdit = () => { setEditing(null); setForm(emptyForm()); };

  const removeSession = async (session: Session) => {
    if (!profile?.halaqaId || !selectedStudent) return;
    try {
      await deleteSession(profile.halaqaId, selectedStudent, session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      // The "سجّل تسميعه اليوم" status badge on the student card is driven by this cached map —
      // without refreshing it here, deleting a student's only (or most recent) session leaves the
      // badge showing stale "logged today" status until the page is reloaded.
      const latest = await getLatestSession(profile.halaqaId, selectedStudent.id);
      setLastSessionByStudent((current) => ({ ...current, [selectedStudent.id]: latest?.date ?? "" }));
      toast.success("حُذفت الجلسة.");
    } catch {
      toast.error("تعذّر حذف الجلسة. تحقق من صلاحية حساب المعلم.");
    }
  };

  const submitSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile?.halaqaId || !selectedStudent) return;
    if (Number(form.from) > Number(form.to) || Number(form.nextFrom) > Number(form.nextTo)) {
      toast.error("تحقق من نطاق الآيات قبل الحفظ.");
      return;
    }
    setSaving(true);
    try {
      await saveSession({
        halaqaId: profile.halaqaId,
        student: selectedStudent,
        date: form.date,
        surah: Number(form.surah), ayahFrom: Number(form.from), ayahTo: Number(form.to),
        evaluation: form.grade,
        nextSurah: Number(form.nextSurah), nextAyahFrom: Number(form.nextFrom), nextAyahTo: Number(form.nextTo),
        kind: form.kind,
        reviewNote: form.kind === "review" ? form.reviewNote.trim() || undefined : undefined,
        uid: profile.uid,
        existingSessionId: editing?.sessionId,
        existingCreatedBy: editing?.createdBy,
      });
      toast.success(editing ? "تم تحديث جلسة التسميع." : (form.kind === "review" ? `تم تسجيل مراجعة ${selectedStudent.name}.` : `تم حفظ جلسة ${selectedStudent.name} بتقييم ${form.grade}.`));
      setEditing(null);
      setForm(emptyForm());
      const list = await listSessions(profile.halaqaId, selectedStudent.id);
      setSessions(list);
      setLastSessionByStudent((current) => ({ ...current, [selectedStudent.id]: list[0]?.date ?? "" }));
    } catch {
      toast.error("تعذّر حفظ الجلسة. تحقق من صلاحية حساب المعلم.");
    } finally {
      setSaving(false);
    }
  };

  if (!authChecked) {
    return <main className="app-shell" dir="rtl"><div className="app-main"><div className="skeleton-block" style={{ height: 200, marginTop: 40 }} /></div></main>;
  }

  return (
    <main className="app-shell" dir="rtl">
      <aside className="app-sidebar">
        <BrandLockup compact />
        <div className="role-chip">مساحة الأستاذ</div>
        <nav className="side-nav" aria-label="تنقل المعلم">
          <button className="is-active" aria-current="page"><LayoutDashboard size={19} /> نظرة عامة</button>
          <button onClick={() => document.getElementById("record-form")?.scrollIntoView({ behavior: "smooth" })}><ClipboardPenLine size={19} /> جلسات التسميع</button>
          <button onClick={() => toast("قريباً: ملخص تقدّم الطلاب")}><BookOpenCheck size={19} /> التقارير</button>
        </nav>
        <div className="sidebar-user">
          <span className="avatar avatar--sage">{halaqa?.teacherName?.slice(0, 2) ?? "أ"}</span>
          <div><b>{halaqa?.teacherName ?? profile?.username}</b><small>{halaqa?.name ?? "حلقتك"}</small></div>
          <button onClick={async () => { await signOutCurrentUser(); setLocation("/login"); }} aria-label="تسجيل الخروج"><LogOut size={18} /></button>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-topbar">
          <div>
            <p className="section-kicker">{new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
            <h1>صباح الخير، {halaqa?.teacherName ?? profile?.username}</h1>
            <p className="role-explainer"><UsersRound size={14} /> دورك: تسجيل التسميع ومتابعة المراجعة لكل طالب</p>
          </div>
          <button className="notification-dot" onClick={() => toast(`لديك ${students.filter((s) => lastSessionByStudent[s.id] !== todayIso()).length} طالب بانتظار تسجيل الجلسة`)}><span /> <Sparkles size={18} /></button>
        </header>

        <div className="hadith-strip maq-reveal">
          <span className="dhikr-tag dhikr-tag--light">{dhikr}</span>
          <p><Sparkles size={16} /> <span>{TEACHER_HADITH.text} <a href={TEACHER_HADITH.sourceHref} target="_blank" rel="noreferrer">{TEACHER_HADITH.sourceLabel}</a></span></p>
        </div>

        <div className="teacher-notice maq-reveal">
          <div><span className="notice-orb"><CalendarDays size={21} /></span><div><p>مهام اليوم</p><strong>{students.filter((s) => lastSessionByStudent[s.id] !== todayIso()).length} طالب بانتظار تسجيل التسميع</strong></div></div>
          <button onClick={() => document.getElementById("record-form")?.scrollIntoView({ behavior: "smooth" })}>ابدأ الآن <ChevronLeft size={18} /></button>
        </div>

        <section className="teacher-grid">
          <div className="student-zone">
            <div className="section-title-row"><div><p className="section-kicker">حلقتك</p><h2>طلاب الحلقة</h2></div></div>
            {loadingStudents ? (
              <div className="skeleton-block" style={{ height: 180 }} />
            ) : students.length === 0 ? (
              <p className="ownership-note">لا يوجد طلاب في حلقتك بعد. يضيفهم المشرف من لوحة الإدارة.</p>
            ) : (
              <div className="student-list">
                {students.map((student) => (
                  <button key={student.id} className={`student-card ${selectedStudentId === student.id ? "is-selected" : ""}`} onClick={() => setSelectedStudentId(student.id)}>
                    <span className="avatar avatar--gold">{student.name.slice(0, 2)}</span>
                    <span className="student-card__copy">
                      <b>{student.name}</b>
                      <small>{lastSessionByStudent[student.id] === todayIso() ? "سجّل تسميعه اليوم" : lastSessionByStudent[student.id] ? "بانتظار تسجيل اليوم" : "لم يُسجَّل له بعد"}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <section className="review-summary" aria-labelledby="review-summary-title">
              <div className="review-summary__head">
                <span className="review-summary__icon"><RefreshCcw size={18} /></span>
                <div><p className="section-kicker">مسار مستقل</p><h3 id="review-summary-title">متابعة المراجعة</h3></div>
                <strong>{reviewSessions.length ? `${reviewSessions.length} جلسات` : "لم تبدأ بعد"}</strong>
              </div>
              <p>{reviewSessions.length ? `آخر مراجعة مسجلة: ${getSurah(reviewSessions[0].surah).name} · الآيات ${reviewSessions[0].ayahFrom} — ${reviewSessions[0].ayahTo}` : "سجّل المراجعة إلى جانب الحفظ الجديد لتثبيت ما أُنجز."}</p>
              <button type="button" onClick={() => { updateForm("kind", "review"); document.getElementById("record-form")?.scrollIntoView({ behavior: "smooth" }); }}><RefreshCcw size={15} /> تسجيل جلسة مراجعة</button>
            </section>

            {selectedStudent && (
              <div className="recent-records">
                <div className="section-title-row"><h3>آخر جلسات {selectedStudent.name}</h3><span className="record-count"><BookOpenCheck size={13} /> {memorizationSessions.length} حفظ · {reviewSessions.length} مراجعة</span></div>
                {sessions.length === 0 && <p className="ownership-note">لا توجد جلسات مسجّلة لهذا الطالب بعد.</p>}
                {sessions.slice(0, 6).map((record) => (
                  <div className="record-row" key={record.id}>
                    <span><b>{getSurah(record.surah).name}</b><small><span className="record-row__kind">{record.kind === "review" ? <RefreshCcw size={11} /> : <BookOpenCheck size={11} />} {record.kind === "review" ? "مراجعة" : "حفظ جديد"}</span> · الآيات {record.ayahFrom} — {record.ayahTo} · {record.date}</small></span>
                    <EvaluationBadge score={record.evaluation} compact />
                    <button onClick={() => startEdit(record)} aria-label="تعديل الجلسة"><ClipboardPenLine size={17} /></button>
                    <button className="danger-icon" onClick={() => void removeSession(record)} aria-label="حذف الجلسة"><Trash2 size={17} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form className="record-form" id="record-form" onSubmit={submitSession} aria-busy={saving}>
            <header>
              <div><p className="section-kicker">{editing ? "تعديل جلسة" : "جلسة جديدة"}</p><h2>{editing ? "تحديث التسميع" : form.kind === "review" ? "تسجيل المراجعة" : "تسجيل التسميع"}</h2></div>
              <span><UsersRound size={17} /> {selectedStudent?.name ?? "اختر طالباً"}</span>
            </header>

            <fieldset className="session-kind-field">
              <legend>نوع الجلسة</legend>
              <div>
                <button type="button" className={form.kind === "memorization" ? "is-picked" : ""} onClick={() => updateForm("kind", "memorization")} aria-pressed={form.kind === "memorization"}><BookOpenCheck size={15} /> حفظ جديد</button>
                <button type="button" className={form.kind === "review" ? "is-picked is-review" : ""} onClick={() => updateForm("kind", "review")} aria-pressed={form.kind === "review"}><RefreshCcw size={15} /> مراجعة</button>
              </div>
            </fieldset>

            <label className="field-label" htmlFor="session-date">تاريخ الجلسة<input id="session-date" type="date" required value={form.date} max={todayIso()} onChange={(event) => updateForm("date", event.target.value)} /></label>
            <div className="field-block">
              <label className="field-label" htmlFor="session-surah">السورة<select id="session-surah" required value={form.surah} onChange={(event) => updateForm("surah", event.target.value)}>{SURAH_LIST.map((surah) => <option value={surah.id} key={surah.id}>{surah.id}. سورة {surah.name}</option>)}</select></label>
              <div className="ayah-inputs">
                <label htmlFor="session-from">من
                  <select id="session-from" required value={form.from} onChange={(event) => updateForm("from", event.target.value)}>
                    {ayahOptions(selectedSurah.ayahs).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
                  </select>
                </label>
                <label htmlFor="session-to">إلى
                  <select id="session-to" required value={form.to} onChange={(event) => updateForm("to", event.target.value)}>
                    {ayahOptions(selectedSurah.ayahs).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
                  </select>
                </label>
              </div>
              <small className="helper-text">سورة {selectedSurah.name}: {selectedSurah.ayahs} آية · يجب أن تكون البداية قبل النهاية</small>
            </div>

            {form.kind === "review" ? (
              <label className="field-label review-note-field" htmlFor="review-note">ملاحظة المراجعة (اختياري)<textarea id="review-note" rows={3} value={form.reviewNote} maxLength={500} onChange={(event) => updateForm("reviewNote", event.target.value)} placeholder="مثال: تحتاج مراجعة أكثر عند آخر الصفحة" /></label>
            ) : null}

            <fieldset className="evaluation-field" aria-describedby="evaluation-help">
              <legend>تقييم الأستاذ</legend>
              <div>{(["ممتاز", "جيد جداً", "جيد", "إعادة"] as Evaluation[]).map((grade) => <button type="button" className={form.grade === grade ? "is-picked" : ""} onClick={() => updateForm("grade", grade)} aria-pressed={form.grade === grade} key={grade}>{grade}</button>)}</div>
              <small id="evaluation-help" className="sr-only">اختر تقييماً واحداً للجلسة</small>
            </fieldset>

            {form.kind === "memorization" && (
              <section className="next-fields">
                <p><Sparkles size={16} /> المطلوب للمرة القادمة</p>
                <label className="field-label" htmlFor="next-surah">السورة<select id="next-surah" required value={form.nextSurah} onChange={(event) => updateForm("nextSurah", event.target.value)}>{SURAH_LIST.map((surah) => <option value={surah.id} key={surah.id}>{surah.id}. سورة {surah.name}</option>)}</select></label>
                <div className="ayah-inputs">
                  <label htmlFor="next-from">من
                    <select id="next-from" required value={form.nextFrom} onChange={(event) => updateForm("nextFrom", event.target.value)}>
                      {ayahOptions(nextSurah.ayahs).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
                    </select>
                  </label>
                  <label htmlFor="next-to">إلى
                    <select id="next-to" required value={form.nextTo} onChange={(event) => updateForm("nextTo", event.target.value)}>
                      {ayahOptions(nextSurah.ayahs).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
                    </select>
                  </label>
                </div>
              </section>
            )}

            <button className="save-session" type="submit" disabled={!selectedStudent || saving}>
              {saving ? <><Loader2 className="spin" size={18} /> جارٍ الحفظ…</> : editing ? "تحديث الجلسة" : form.kind === "review" ? <><RefreshCcw size={19} /> حفظ جلسة المراجعة</> : "حفظ جلسة التسميع"}
            </button>
            {editing && <button type="button" className="ownership-note" style={{ width: "100%", textAlign: "center", marginTop: ".5rem" }} onClick={cancelEdit}>إلغاء التعديل</button>}
            <p className="ownership-note">ستُحفظ هذه الجلسة ضمن حلقتك ويظهر ملخصها في ملف الطالب.</p>
          </form>
        </section>
      </section>

    </main>
  );
}
