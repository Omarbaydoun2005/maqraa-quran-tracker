import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import {
  BarChart3, ChevronLeft, ClipboardPenLine, Copy, Download, LayoutDashboard, Link2, LogOut, Plus,
  QrCode, Settings2, ShieldCheck, Sparkles, Trash2, UserPlus, UserRound, UsersRound, X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/BrandMark";
import { EvaluationBadge } from "@/components/EvaluationBadge";
import { getSurah, SURAH_LIST } from "@/lib/quran";
import { ENVY_HADITH, pickRandomDhikr } from "@/lib/dhikr";
import {
  createHalaqa, createTemporaryPassword, deleteSession, type Evaluation,
  fetchCurrentUserProfile, getTeacherAccounts, type Halaqa, isDemoMode, listHalaqat, listSessions,
  listStudents, provisionTeacherAccount, removeTeacherAccess, saveSession,
  type Session, signOutCurrentUser, type Student, type TeacherAccount, watchAuthState,
} from "@/lib/firebase";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function SupervisorDashboard() {
  const [, setLocation] = useLocation();
  const [authChecked, setAuthChecked] = useState(isDemoMode);
  const [profile, setProfile] = useState<{ uid: string; username: string } | null>(null);

  const [halaqat, setHalaqat] = useState<Halaqa[]>([]);
  const [loadingHalaqat, setLoadingHalaqat] = useState(true);
  const [studentsByHalaqa, setStudentsByHalaqa] = useState<Record<string, Student[]>>({});

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [qr, setQr] = useState("");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [teacherAccounts, setTeacherAccounts] = useState<TeacherAccount[]>([]);
  const [teacherCredentials, setTeacherCredentials] = useState<Array<{ username: string; password: string; halaqaName: string }>>([]);
  const [pendingTeacherDelete, setPendingTeacherDelete] = useState<TeacherAccount | null>(null);

  const [showAddHalaqa, setShowAddHalaqa] = useState(false);
  const [halaqaName, setHalaqaName] = useState("");
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [teacherForm, setTeacherForm] = useState({ username: "", password: "", halaqaId: "" });
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editForm, setEditForm] = useState({ date: "", surah: "1", from: "1", to: "1", grade: "ممتاز" as Evaluation, nextSurah: "1", nextFrom: "1", nextTo: "1" });
  const [busy, setBusy] = useState(false);
  const [dhikr] = useState(pickRandomDhikr);

  useEffect(() => {
    if (isDemoMode) return;
    return watchAuthState(async (user) => {
      if (!user) { setLocation("/login"); return; }
      const p = await fetchCurrentUserProfile(user.uid);
      if (!p || p.role !== "supervisor") {
        await signOutCurrentUser();
        setLocation("/login");
        return;
      }
      setProfile(p);
      setAuthChecked(true);
    });
  }, [setLocation]);

  const allStudents = useMemo(() => halaqat.flatMap((halaqa) => studentsByHalaqa[halaqa.id] ?? []), [halaqat, studentsByHalaqa]);
  const selectedStudent = useMemo(() => allStudents.find((student) => student.id === selectedStudentId) ?? allStudents[0], [allStudents, selectedStudentId]);

  // Split into two independent phases instead of one big sequential chain: halaqat + students +
  // teacher accounts is a handful of requests and renders the whole page almost immediately, while
  // the "recent activity" feed needs one query *per student* (5 sessions each) — with 50+ real
  // students that's dozens of round trips, and waiting for all of them before showing anything is
  // exactly what made the dashboard feel slow to open. Now that panel loads in the background and
  // fills in on its own; everything else is interactive the moment the fast phase resolves.
  const loadOverview = async () => {
    setLoadingHalaqat(true);
    try {
      const [list, accounts] = await Promise.all([listHalaqat(), getTeacherAccounts()]);
      setHalaqat(list);
      setTeacherForm((current) => ({ ...current, halaqaId: current.halaqaId || list[0]?.id || "" }));
      setTeacherAccounts(accounts);

      const studentEntries = await Promise.all(list.map(async (halaqa) => [halaqa.id, await listStudents(halaqa.id)] as const));
      const nextStudentsByHalaqa = Object.fromEntries(studentEntries) as Record<string, Student[]>;
      setStudentsByHalaqa(nextStudentsByHalaqa);
      setLoadingHalaqat(false);

      setLoadingSessions(true);
      const allNextStudents = Object.values(nextStudentsByHalaqa).flat();
      const recentByStudent = await Promise.all(
        allNextStudents.map((student) => listSessions(student.halaqaId, student.id, 5)),
      );
      setSessions(recentByStudent.flat().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12));
    } catch {
      toast.error("تعذّر تحميل البيانات حالياً.");
    } finally {
      setLoadingHalaqat(false);
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (!authChecked) return;
    void loadOverview();
  }, [authChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  const publicUrl = selectedStudent && typeof window !== "undefined" ? `${window.location.origin}/p/${selectedStudent.publicId}` : "";
  useEffect(() => {
    if (!publicUrl) { setQr(""); return; }
    QRCode.toDataURL(publicUrl, { width: 360, margin: 1, color: { dark: "#21170f", light: "#fffdf7" } }).then(setQr);
  }, [publicUrl]);

  const totalStudents = allStudents.length;
  const totalToday = sessions.filter((session) => session.date === todayIso()).length;

  const addHalaqa = async (event: FormEvent) => {
    event.preventDefault();
    if (!halaqaName.trim()) return;
    setBusy(true);
    try {
      await createHalaqa({ name: halaqaName.trim(), order: halaqat.length });
      toast.success("أُضيفت الحلقة.");
      setHalaqaName("");
      setShowAddHalaqa(false);
      await loadOverview();
    } catch {
      toast.error("تعذّر إضافة الحلقة. تحقق من صلاحيات المشرف.");
    } finally {
      setBusy(false);
    }
  };

  const addTeacher = async (event: FormEvent) => {
    event.preventDefault();
    if (!teacherForm.username.trim() || teacherForm.password.length < 6 || !teacherForm.halaqaId) {
      toast.error("أدخل اسم مستخدم وكلمة مرور لا تقل عن ٦ أحرف، واختر حلقة.");
      return;
    }
    setBusy(true);
    try {
      await provisionTeacherAccount({ username: teacherForm.username.trim(), password: teacherForm.password, halaqaId: teacherForm.halaqaId });
      toast.success("أُنشئ حساب المعلّم.");
      setTeacherForm({ username: "", password: "", halaqaId: teacherForm.halaqaId });
      setShowAddTeacher(false);
      setTeacherAccounts(await getTeacherAccounts());
    } catch {
      toast.error("تعذّر إنشاء حساب المعلّم. قد يكون اسم المستخدم مستخدماً من قبل.");
    } finally {
      setBusy(false);
    }
  };

  const generateMissingTeacherAccounts = async () => {
    setBusy(true);
    setTeacherCredentials([]);
    try {
      const existingHalaqaIds = new Set(teacherAccounts.map((account) => account.halaqaId));
      const created: Array<{ username: string; password: string; halaqaName: string }> = [];
      for (let index = 0; index < halaqat.length; index += 1) {
        const halaqa = halaqat[index];
        if (existingHalaqaIds.has(halaqa.id)) continue;
        const username = `teacher-${String(index + 1).padStart(2, "0")}`;
        const password = createTemporaryPassword();
        // eslint-disable-next-line no-await-in-loop -- each account must exist before the next is provisioned under its own secondary auth session
        await provisionTeacherAccount({ username, password, halaqaId: halaqa.id });
        created.push({ username, password, halaqaName: halaqa.name });
      }
      setTeacherCredentials(created);
      setTeacherAccounts(await getTeacherAccounts());
      toast.success(created.length ? `تم إنشاء ${created.length} حساب معلّم.` : "كل الحلقات لديها حسابات معلّمين بالفعل.", {
        description: created.length ? "احفظ كلمات المرور الآن؛ لن تظهر مرة أخرى." : undefined,
      });
    } catch {
      toast.error("تعذّر إنشاء الحسابات تلقائياً.");
    } finally {
      setBusy(false);
    }
  };

  const confirmTeacherRemoval = async () => {
    if (!pendingTeacherDelete) return;
    try {
      await removeTeacherAccess(pendingTeacherDelete);
      setTeacherAccounts((current) => current.filter((account) => account.uid !== pendingTeacherDelete.uid));
      toast.success("تم إيقاف وصول المعلم وإزالة اسم المستخدم.", { description: "يمكن حذف هوية Firebase نهائياً من صفحة Authentication عند الحاجة." });
    } catch {
      toast.error("تعذّر إيقاف الحساب حالياً.");
    } finally {
      setPendingTeacherDelete(null);
    }
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("نُسخ رابط الطالب الخاص.");
    } catch {
      toast.error("تعذّر نسخ الرابط تلقائياً.");
    }
  };

  const openEditSession = (session: Session) => {
    setEditingSession(session);
    setEditForm({
      date: session.date, surah: String(session.surah), from: String(session.ayahFrom), to: String(session.ayahTo),
      grade: session.evaluation, nextSurah: String(session.nextSurah), nextFrom: String(session.nextAyahFrom), nextTo: String(session.nextAyahTo),
    });
  };

  const saveEditedSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSession || !profile) return;
    const student = allStudents.find((item) => item.id === editingSession.studentId);
    if (!student) return;
    if (Number(editForm.from) > Number(editForm.to) || Number(editForm.nextFrom) > Number(editForm.nextTo)) {
      toast.error("تحقق من نطاق الآيات قبل الحفظ.");
      return;
    }
    setBusy(true);
    try {
      await saveSession({
        halaqaId: student.halaqaId, student, date: editForm.date,
        surah: Number(editForm.surah), ayahFrom: Number(editForm.from), ayahTo: Number(editForm.to),
        evaluation: editForm.grade, nextSurah: Number(editForm.nextSurah), nextAyahFrom: Number(editForm.nextFrom), nextAyahTo: Number(editForm.nextTo),
        kind: editingSession.kind, reviewNote: editingSession.reviewNote,
        uid: profile.uid, existingSessionId: editingSession.id, existingCreatedBy: editingSession.createdBy,
      });
      toast.success("تم تحديث الجلسة.");
      setEditingSession(null);
      setSessions((current) => current.map((item) => (item.id === editingSession.id ? { ...item, date: editForm.date, surah: Number(editForm.surah), ayahFrom: Number(editForm.from), ayahTo: Number(editForm.to), evaluation: editForm.grade, nextSurah: Number(editForm.nextSurah), nextAyahFrom: Number(editForm.nextFrom), nextAyahTo: Number(editForm.nextTo) } : item)));
    } catch {
      toast.error("تعذّر تعديل الجلسة. تحقق من صلاحياتك وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  const removeSessionAsSupervisor = async (session: Session) => {
    const student = allStudents.find((item) => item.id === session.studentId);
    if (!student) return;
    try {
      await deleteSession(student.halaqaId, student, session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      toast.success("حُذفت الجلسة.");
    } catch {
      toast.error("تعذّر حذف الجلسة.");
    }
  };

  if (!authChecked) {
    return <main className="app-shell supervisor-shell" dir="rtl"><div className="app-main"><div className="skeleton-block" style={{ height: 200, marginTop: 40 }} /></div></main>;
  }

  return (
    <main className="app-shell supervisor-shell" dir="rtl">
      <aside className="app-sidebar">
        <BrandLockup compact />
        <div className="role-chip role-chip--super">مساحة المشرف</div>
        <nav className="side-nav" aria-label="تنقل المشرف">
          <button className="is-active" aria-current="page"><LayoutDashboard size={19} /> لوحة المتابعة</button>
          <button onClick={() => halaqat[0] && setLocation(`/supervisor/halaqa/${halaqat[0].id}`)}><UsersRound size={19} /> الحلقات والطلاب</button>
          <button onClick={() => toast("قريباً: تقارير الإنجاز")}><BarChart3 size={19} /> التقارير</button>
          <button onClick={() => toast("قريباً: إعدادات المقرأة")}><Settings2 size={19} /> الإعدادات</button>
        </nav>
        <div className="sidebar-user">
          <span className="avatar avatar--gold">م</span>
          <div><b>{profile?.username ?? "المشرف"}</b><small>صلاحيات كاملة</small></div>
          <button onClick={async () => { await signOutCurrentUser(); setLocation("/login"); }} aria-label="تسجيل الخروج"><LogOut size={18} /></button>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-topbar">
          <div><p className="section-kicker">نظرة الإدارة</p><h1>مرحباً بك، {profile?.username ?? "مشرف المقرأة"}</h1><p className="role-explainer"><UsersRound size={14} /> دورك: إدارة الحلقات والطلاب وروابط المتابعة العائلية</p></div>
          <span className="secure-status"><ShieldCheck size={17} /> صلاحيات المشرف مفعّلة</span>
        </header>

        <div className="hadith-strip maq-reveal">
          <span className="dhikr-tag dhikr-tag--light">{dhikr}</span>
          <p><Sparkles size={16} /> <span>{ENVY_HADITH.text} <a href={ENVY_HADITH.sourceHref} target="_blank" rel="noreferrer">{ENVY_HADITH.sourceLabel}</a></span></p>
        </div>

        <section className="supervisor-stats maq-reveal">
          <article><p>الحلقات النشطة</p><b>{halaqat.length}</b><span>{loadingHalaqat ? "جارٍ التحميل…" : "إجمالي الحلقات المسجّلة"}</span></article>
          <article><p>إجمالي الطلاب</p><b>{totalStudents}</b><span>{totalToday} تسميعاً مسجلاً اليوم</span></article>
          <article><p>جلسات النشاط</p><b>{sessions.length}</b><span>من آخر السجلات المتاحة</span></article>
        </section>

        <section className="teacher-accounts-panel maq-reveal">
          <div className="section-title-row">
            <div><p className="section-kicker">صلاحيات الدخول</p><h2>حسابات المعلّمين</h2></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary-action" onClick={() => setShowAddTeacher(true)}><UserPlus size={16} /> حساب جديد</button>
              <button onClick={() => void generateMissingTeacherAccounts()} disabled={busy}><UserPlus size={16} /> إنشاء لكل حلقة ناقصة</button>
            </div>
          </div>
          {teacherCredentials.length > 0 && (
            <div className="credential-reveal" role="status">
              <div><ShieldCheck size={18} /><b>احفظ بيانات الدخول الآن</b><small>تظهر كلمات المرور الجديدة مرة واحدة فقط في هذه الشاشة.</small></div>
              {teacherCredentials.map((credential) => <div className="credential-row" key={credential.username}><span><b>{credential.halaqaName}</b><small>{credential.username}</small></span><code>{credential.password}</code></div>)}
            </div>
          )}
          <div className="teacher-account-list">
            {teacherAccounts.length ? teacherAccounts.map((account) => (
              <div className="teacher-account-row" key={account.uid}>
                <span className="avatar avatar--sage"><UserRound size={16} /></span>
                <span><b>{account.username}</b><small>{halaqat.find((halaqa) => halaqa.id === account.halaqaId)?.name ?? account.halaqaId}</small></span>
                <button className="danger-icon" onClick={() => setPendingTeacherDelete(account)} aria-label={`إيقاف حساب ${account.username}`}><Trash2 size={17} /></button>
              </div>
            )) : <div className="audit-empty"><UserPlus size={22} /><p>لم تُنشأ حسابات معلّمين بعد.</p></div>}
          </div>
        </section>

        <section className="supervisor-grid">
          <div className="halaqat-panel">
            <div className="section-title-row">
              <div><p className="section-kicker">المتابعة اليومية</p><h2>الحلقات</h2></div>
              <button className="add-text-button" onClick={() => setShowAddHalaqa(true)}><Plus size={17} /> إضافة حلقة</button>
            </div>
            {loadingHalaqat ? <div className="skeleton-block" style={{ height: 140 }} /> : halaqat.length === 0 ? (
              <p className="ownership-note">لا توجد حلقات بعد. أضف أول حلقة من الزر أعلاه.</p>
            ) : (
              <div className="halaqa-list">
                {halaqat.map((halaqa, index) => (
                  <button key={halaqa.id} className="halaqa-row" onClick={() => setLocation(`/supervisor/halaqa/${halaqa.id}`)}>
                    <span className={`halaqa-row__mark halaqa-row__mark--${["gold", "sage", "clay", "ink"][index % 4]}`}><UsersRound size={17} aria-hidden="true" /></span>
                    <span><b>{halaqa.name}</b><small>{halaqa.teacherName ?? "لم يُعيّن معلّم بعد"}</small></span>
                    <span className="halaqa-row__meta"><b>{studentsByHalaqa[halaqa.id]?.length ?? 0}</b><small>طالباً</small></span>
                    <ChevronLeft className="halaqa-row__arrow" size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="qr-panel">
            <div className="qr-panel__head"><div><p className="section-kicker">رابط العائلة</p><h2>رمز الطالب</h2></div><QrCode size={23} aria-hidden="true" /></div>
            {allStudents.length === 0 ? <div className="qr-empty"><UserRound size={24} /><p>أضف طالباً من صفحة إحدى الحلقات لعرض رمز QR الخاص به.</p></div> : (
              <>
                <label className="student-select-label" htmlFor="qr-student">اختر الطالب
                  <select id="qr-student" value={selectedStudent?.id ?? ""} onChange={(event) => setSelectedStudentId(event.target.value)}>
                    {allStudents.map((student) => <option value={student.id} key={`${student.halaqaId}-${student.id}`}>{student.name}</option>)}
                  </select>
                </label>
                <div className="qr-code">{qr && <img src={qr} alt={`رمز QR الخاص بالطالب ${selectedStudent?.name ?? ""}`} />}</div>
                <div className="qr-name"><b>{selectedStudent?.name}</b><small>{selectedStudent?.phone ? `${selectedStudent.phoneRelation ?? "ولي الأمر"}: ${selectedStudent.phone}` : "لا يوجد هاتف مسجل"}</small></div>
                <div className="qr-actions">
                  <button onClick={() => void copyLink()}><Copy size={17} /> نسخ الرابط</button>
                  {qr && <a href={qr} download={`qr-${selectedStudent?.id}.png`}><Download size={17} /> تنزيل QR</a>}
                </div>
                <div className="qr-actions qr-actions--secondary">
                  <button onClick={() => selectedStudent && setLocation(`/supervisor/halaqa/${selectedStudent.halaqaId}/student/${selectedStudent.id}`)}><UserRound size={16} /> فتح ملف الطالب</button>
                </div>
                <p className="qr-privacy"><Link2 size={15} /> رابط فريد ومخصص لهذا الطالب فقط.</p>
              </>
            )}
          </div>
        </section>

        <section className="audit-panel maq-reveal maq-delay-1">
          <div className="section-title-row"><div><p className="section-kicker">التحكم الكامل</p><h2>آخر جلسات التسميع</h2></div></div>
          {loadingSessions ? <div className="skeleton-block" style={{ height: 100 }} /> : sessions.length === 0 ? (
            <div className="audit-empty"><ClipboardPenLine size={23} /><p>لا توجد جلسات مسجّلة بعد. ستظهر هنا بعد بدء المعلّمين بالتسجيل.</p></div>
          ) : (
            <div className="audit-list">
              {sessions.map((session) => {
                const student = allStudents.find((item) => item.id === session.studentId);
                return (
                  <div className="audit-row" key={session.id}>
                    <span className="avatar avatar--sage">{session.studentName.slice(0, 2)}</span>
                    <span><b>{session.studentName}</b><small>{getSurah(session.surah).name} · {session.ayahFrom} — {session.ayahTo}</small></span>
                    <EvaluationBadge score={session.evaluation} compact />
                    <span className="audit-row__actions">
                      <button onClick={() => student && setLocation(`/supervisor/halaqa/${student.halaqaId}/student/${student.id}`)} aria-label={`فتح ملف ${session.studentName}`}><UserRound size={17} /></button>
                      <button onClick={() => openEditSession(session)} aria-label="تعديل الجلسة"><ClipboardPenLine size={17} /></button>
                      <button className="danger-icon" onClick={() => void removeSessionAsSupervisor(session)} aria-label="حذف الجلسة"><Trash2 size={17} /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>

      {showAddHalaqa && (
        <div className="modal-backdrop" role="presentation">
          <form className="mini-modal" onSubmit={addHalaqa} role="dialog" aria-modal="true" aria-labelledby="add-halaqa-title">
            <button type="button" className="modal-close" onClick={() => setShowAddHalaqa(false)} aria-label="إغلاق نافذة إضافة الحلقة"><X size={20} /></button>
            <UserPlus size={24} /><p className="section-kicker">إدارة الحلقات</p><h2 id="add-halaqa-title">إضافة حلقة جديدة</h2>
            <label className="field-label" htmlFor="new-halaqa-name">اسم الحلقة<input id="new-halaqa-name" value={halaqaName} onChange={(event) => setHalaqaName(event.target.value)} placeholder="مثال: حلقة النور" autoFocus required /></label>
            <button className="save-session" type="submit" disabled={busy}><Plus size={18} /> حفظ الحلقة</button>
          </form>
        </div>
      )}

      {showAddTeacher && (
        <div className="modal-backdrop" role="presentation">
          <form className="mini-modal" onSubmit={addTeacher} role="dialog" aria-modal="true" aria-labelledby="add-teacher-title">
            <button type="button" className="modal-close" onClick={() => setShowAddTeacher(false)} aria-label="إغلاق نافذة إنشاء حساب المعلم"><X size={20} /></button>
            <UserPlus size={24} /><p className="section-kicker">حسابات المعلّمين</p><h2 id="add-teacher-title">إنشاء حساب معلّم</h2>
            <label className="field-label" htmlFor="new-teacher-username">اسم المستخدم<input id="new-teacher-username" value={teacherForm.username} onChange={(event) => setTeacherForm((current) => ({ ...current, username: event.target.value }))} placeholder="مثال: teacher-07" autoFocus required /></label>
            <label className="field-label" htmlFor="new-teacher-password">كلمة المرور<input id="new-teacher-password" type="password" value={teacherForm.password} onChange={(event) => setTeacherForm((current) => ({ ...current, password: event.target.value }))} placeholder="٦ أحرف على الأقل" required minLength={6} /></label>
            <label className="field-label" htmlFor="new-teacher-halaqa">الحلقة<select id="new-teacher-halaqa" value={teacherForm.halaqaId} onChange={(event) => setTeacherForm((current) => ({ ...current, halaqaId: event.target.value }))}>{halaqat.map((halaqa) => <option value={halaqa.id} key={halaqa.id}>{halaqa.name}</option>)}</select></label>
            <button className="save-session" type="submit" disabled={busy}><Plus size={18} /> إنشاء الحساب</button>
          </form>
        </div>
      )}

      {pendingTeacherDelete && (
        <div className="modal-backdrop" role="presentation">
          <div className="mini-modal mini-modal--danger" role="alertdialog" aria-modal="true" aria-labelledby="delete-teacher-title">
            <button type="button" className="modal-close" onClick={() => setPendingTeacherDelete(null)} aria-label="إلغاء إيقاف حساب المعلم"><X size={20} /></button>
            <Trash2 size={24} /><p className="section-kicker">إيقاف وصول</p><h2 id="delete-teacher-title">إيقاف حساب المعلم؟</h2>
            <p className="modal-copy">سيُمنع <b>{pendingTeacherDelete.username}</b> من دخول النظام، وستتم إزالة ارتباطه بالحلقة. لا يُحذف حساب Firebase النهائي من المتصفح.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingTeacherDelete(null)}>إلغاء</button>
              <button type="button" className="danger-button" onClick={() => void confirmTeacherRemoval()}><Trash2 size={16} /> إيقاف الحساب</button>
            </div>
          </div>
        </div>
      )}

      {editingSession && (
        <div className="modal-backdrop" role="presentation">
          <form className="mini-modal" onSubmit={saveEditedSession} role="dialog" aria-modal="true" aria-labelledby="edit-session-title">
            <button type="button" className="modal-close" onClick={() => setEditingSession(null)} aria-label="إغلاق تعديل الجلسة"><X size={20} /></button>
            <ClipboardPenLine size={24} /><p className="section-kicker">{editingSession.studentName}</p><h2 id="edit-session-title">تعديل الجلسة</h2>
            <label className="field-label" htmlFor="edit-session-date">تاريخ الجلسة<input id="edit-session-date" type="date" value={editForm.date} max={todayIso()} onChange={(event) => setEditForm((current) => ({ ...current, date: event.target.value }))} required /></label>
            <div className="field-block">
              <label className="field-label" htmlFor="edit-session-surah">السورة<select id="edit-session-surah" value={editForm.surah} onChange={(event) => setEditForm((current) => ({ ...current, surah: event.target.value }))}>{SURAH_LIST.map((surah) => <option value={surah.id} key={surah.id}>{surah.id}. سورة {surah.name}</option>)}</select></label>
              <div className="ayah-inputs">
                <label htmlFor="edit-session-from">من
                  <select id="edit-session-from" value={editForm.from} onChange={(event) => setEditForm((current) => ({ ...current, from: event.target.value }))}>
                    {Array.from({ length: getSurah(editForm.surah).ayahs }, (_, index) => index + 1).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
                  </select>
                </label>
                <label htmlFor="edit-session-to">إلى
                  <select id="edit-session-to" value={editForm.to} onChange={(event) => setEditForm((current) => ({ ...current, to: event.target.value }))}>
                    {Array.from({ length: getSurah(editForm.surah).ayahs }, (_, index) => index + 1).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <fieldset className="evaluation-field">
              <legend>تقييم الأستاذ</legend>
              <div>{(["ممتاز", "جيد جداً", "جيد", "إعادة"] as Evaluation[]).map((grade) => <button type="button" key={grade} className={editForm.grade === grade ? "is-picked" : ""} onClick={() => setEditForm((current) => ({ ...current, grade }))}>{grade}</button>)}</div>
            </fieldset>
            <section className="next-fields">
              <p>المطلوب للمرة القادمة</p>
              <label className="field-label" htmlFor="edit-next-surah">السورة<select id="edit-next-surah" value={editForm.nextSurah} onChange={(event) => setEditForm((current) => ({ ...current, nextSurah: event.target.value }))}>{SURAH_LIST.map((surah) => <option value={surah.id} key={surah.id}>{surah.id}. سورة {surah.name}</option>)}</select></label>
              <div className="ayah-inputs">
                <label htmlFor="edit-next-from">من
                  <select id="edit-next-from" value={editForm.nextFrom} onChange={(event) => setEditForm((current) => ({ ...current, nextFrom: event.target.value }))}>
                    {Array.from({ length: getSurah(editForm.nextSurah).ayahs }, (_, index) => index + 1).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
                  </select>
                </label>
                <label htmlFor="edit-next-to">إلى
                  <select id="edit-next-to" value={editForm.nextTo} onChange={(event) => setEditForm((current) => ({ ...current, nextTo: event.target.value }))}>
                    {Array.from({ length: getSurah(editForm.nextSurah).ayahs }, (_, index) => index + 1).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
                  </select>
                </label>
              </div>
            </section>
            <button className="save-session" type="submit" disabled={busy}>حفظ التعديل</button>
          </form>
        </div>
      )}
    </main>
  );
}
