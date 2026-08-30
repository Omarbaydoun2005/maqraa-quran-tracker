import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowRight, BarChart3, BookOpenCheck, CalendarDays, ChevronLeft, ClipboardPenLine, LayoutDashboard, LogOut, MapPin, MoreHorizontal, Pencil, RefreshCcw, ShieldCheck, Sparkles, Trash2, UserPlus, UserRound, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/BrandMark";
import { EvaluationBadge } from "@/components/EvaluationBadge";
import {
  createStudent, deleteHalaqa, deleteStudent, getHalaqa, importStudentStartingPosition, listSessions, listStudents,
  signOutCurrentUser, updateStudent, type Halaqa, type Session, type Student,
} from "@/lib/firebase";
import { arabicNumber, getSurah, SURAH_LIST } from "@/lib/quran";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join(" ");
}

const ayahOptions = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

const emptyStudentForm = { name: "", age: "", phone: "", phoneRelation: "" as "" | "الأب" | "الأم" | "الأخ" };

export default function HalaqaDetailsPage() {
  const [, setLocation] = useLocation();
  // Route param via wouter's matcher, not a path-split index — see the identical fix (and the
  // "profile not found" bug it caused) in StudentProfilePage.tsx.
  const [, params] = useRoute<{ halaqaId: string }>("/supervisor/halaqa/:halaqaId");
  const halaqaId = params?.halaqaId ?? "";
  const [halaqa, setHalaqa] = useState<Halaqa | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState(emptyStudentForm);
  const [editPositionSurah, setEditPositionSurah] = useState("1");
  const [editPositionAyah, setEditPositionAyah] = useState("1");
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteHalaqa, setConfirmDeleteHalaqa] = useState(false);
  const [deletingHalaqa, setDeletingHalaqa] = useState(false);
  const [deleteHalaqaConfirmText, setDeleteHalaqaConfirmText] = useState("");
  const [importingPosition, setImportingPosition] = useState<Student | null>(null);
  const [importSurah, setImportSurah] = useState("1");
  const [importAyah, setImportAyah] = useState("1");
  const [importSaving, setImportSaving] = useState(false);

  const loadHalaqa = async () => {
    setLoading(true);
    try {
      const [nextHalaqa, nextStudents] = await Promise.all([getHalaqa(halaqaId), listStudents(halaqaId)]);
      setHalaqa(nextHalaqa);
      setStudents(nextStudents);
      const lists = await Promise.all(nextStudents.map((student) => listSessions(halaqaId, student.id)));
      setSessions(lists.flat().sort((a, b) => (a.date < b.date ? 1 : -1)));
    } catch {
      setHalaqa(null);
      setStudents([]);
      setSessions([]);
      toast.error("تعذّر تحميل بيانات الحلقة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadHalaqa(); }, [halaqaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const todaySessions = sessions.filter((session) => session.date === new Date().toISOString().slice(0, 10)).length;
  const excellentRate = sessions.length ? Math.round((sessions.filter((session) => session.evaluation === "ممتاز").length / sessions.length) * 100) : 0;
  const recentSessions = useMemo(() => sessions.slice(0, 8), [sessions]);

  const submitAddStudent = async (event: FormEvent) => {
    event.preventDefault();
    if (!studentForm.name.trim() || saving) return;
    setSaving(true);
    try {
      await createStudent({
        halaqaId,
        name: studentForm.name.trim(),
        age: studentForm.age ? Number(studentForm.age) : undefined,
        phone: studentForm.phone.trim() || undefined,
        phoneRelation: studentForm.phoneRelation || undefined,
      });
      // Refresh in place — no page reload needed to see the new student.
      await loadHalaqa();
      setStudentForm(emptyStudentForm);
      setShowAddStudent(false);
      toast.success("أُضيف الطالب، وأصبح رمز QR الخاص به جاهزاً.");
    } catch {
      toast.error("تعذّر إضافة الطالب. تحقق من صلاحية حساب المشرف.");
    } finally {
      setSaving(false);
    }
  };

  const startEditStudent = (student: Student) => {
    setEditingStudent(student);
    setEditForm({
      name: student.name,
      age: student.age ? String(student.age) : "",
      phone: student.phone ?? "",
      phoneRelation: (student.phoneRelation as typeof emptyStudentForm.phoneRelation) ?? "",
    });
    // Best-effort reverse-lookup so the position dropdowns start on the student's real current
    // position instead of always resetting to الفاتحة ١ — matches by surah name and reads the
    // leading number out of lastRange (which is sometimes a single ayah, sometimes "من — إلى").
    const matchedSurah = SURAH_LIST.find((surah) => surah.name === student.lastSurah);
    const parsedAyah = student.lastRange ? parseInt(student.lastRange.replace(/[^\d]/g, ""), 10) : NaN;
    setEditPositionSurah(matchedSurah ? String(matchedSurah.id) : "1");
    setEditPositionAyah(matchedSurah && Number.isFinite(parsedAyah) && parsedAyah >= 1 && parsedAyah <= matchedSurah.ayahs ? String(parsedAyah) : "1");
  };

  const submitEditStudent = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingStudent || !editForm.name.trim() || editSaving) return;
    setEditSaving(true);
    try {
      const patch = {
        name: editForm.name.trim(),
        age: editForm.age ? Number(editForm.age) : undefined,
        phone: editForm.phone.trim() || undefined,
        phoneRelation: editForm.phoneRelation || undefined,
        lastSurah: getSurah(editPositionSurah).name,
        lastRange: arabicNumber(editPositionAyah),
      };
      await updateStudent(halaqaId, editingStudent, patch);
      // Refresh in place — same instant-update pattern as add/delete, no page reload.
      setStudents((current) => current.map((student) => (student.id === editingStudent.id ? { ...student, ...patch } : student)));
      setEditingStudent(null);
      toast.success("حُفظت بيانات الطالب.");
    } catch {
      toast.error("تعذّر حفظ بيانات الطالب. تحقق من صلاحية حساب المشرف.");
    } finally {
      setEditSaving(false);
    }
  };

  const startImportPosition = (student: Student) => {
    setImportingPosition(student);
    setImportSurah("1");
    setImportAyah("1");
  };

  const confirmImportPosition = async () => {
    if (!importingPosition || importSaving) return;
    setImportSaving(true);
    try {
      const position = { lastSurah: getSurah(importSurah).name, lastRange: arabicNumber(importAyah) };
      await importStudentStartingPosition(halaqaId, importingPosition.id, position);
      setStudents((current) => current.map((student) => (student.id === importingPosition.id ? { ...student, ...position } : student)));
      setImportingPosition(null);
      toast.success("سُجّل موضع الطالب الحالي.");
    } catch {
      toast.error("تعذّر حفظ الموضع. تحقق من صلاحية حساب المشرف.");
    } finally {
      setImportSaving(false);
    }
  };

  const confirmDeleteStudent = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteStudent(halaqaId, pendingDelete);
      setStudents((current) => current.filter((student) => student.id !== pendingDelete.id));
      setSessions((current) => current.filter((session) => session.studentId !== pendingDelete.id));
      toast.success("حُذف الطالب وسجله بالكامل.");
    } catch {
      toast.error("تعذّر حذف الطالب. تحقق من صلاحية حساب المشرف.");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const confirmDeleteHalaqaAction = async () => {
    if (!halaqa || deletingHalaqa || deleteHalaqaConfirmText.trim() !== halaqa.name) return;
    setDeletingHalaqa(true);
    try {
      await deleteHalaqa(halaqaId);
      toast.success("حُذفت الحلقة وكل طلابها.");
      setLocation("/supervisor");
    } catch {
      toast.error("تعذّر حذف الحلقة. تحقق من صلاحية حساب المشرف.");
      setDeletingHalaqa(false);
    }
  };

  return (
    <main className="app-shell supervisor-shell" dir="rtl">
      <aside className="app-sidebar">
        <BrandLockup compact />
        <div className="role-chip role-chip--super">مساحة المشرف</div>
        <nav className="side-nav" aria-label="تنقل المشرف">
          <button onClick={() => setLocation("/supervisor")}><LayoutDashboard size={19} /> لوحة المتابعة</button>
          <button className="is-active" aria-current="page"><UsersRound size={19} /> الحلقات والطلاب</button>
          <button onClick={() => toast("قريباً: تقارير الإنجاز")}><BarChart3 size={19} /> التقارير</button>
        </nav>
        <div className="sidebar-user">
          <span className="avatar avatar--gold">م</span>
          <div><b>المشرف</b><small>إدارة الحلقات والطلاب</small></div>
          <button onClick={async () => { await signOutCurrentUser(); setLocation("/login"); }} aria-label="تسجيل الخروج"><LogOut size={18} /></button>
        </div>
      </aside>
      <section className="app-main halaqa-details-main">
        {loading && <div className="profile-state" role="status"><span className="route-gate__spinner" /> جارٍ تحميل الحلقة…</div>}
        {!loading && !halaqa && (
          <div className="profile-state profile-state--error">
            <UsersRound size={28} />
            <h1>الحلقة غير موجودة</h1>
            <p>تحقق من الرابط أو عد إلى لوحة المتابعة.</p>
            <button className="back-to-dashboard" onClick={() => setLocation("/supervisor")}><ArrowRight size={17} /> العودة إلى لوحة المتابعة</button>
          </div>
        )}
        {!loading && halaqa && <>
          <header className="app-topbar">
            <div>
              <button className="back-to-dashboard" onClick={() => setLocation("/supervisor")}><ArrowRight size={17} /> العودة إلى لوحة المتابعة</button>
              <p className="section-kicker">إدارة الحلقة</p>
              <h1>{halaqa.name}</h1>
              <p className="page-subtitle"><UsersRound size={15} /> {halaqa.teacherName ?? "لم يُعيّن معلّم بعد"} <span>·</span> {arabicNumber(students.length)} طالباً</p>
            </div>
            <span className="halaqa-header-actions">
              <span className="secure-status"><ShieldCheck size={17} /> عرض المشرف</span>
              <button className="danger-text-button" onClick={() => { setDeleteHalaqaConfirmText(""); setConfirmDeleteHalaqa(true); }}><Trash2 size={15} /> حذف الحلقة</button>
            </span>
          </header>

          <section className="halaqa-detail-stats" aria-label="ملخص الحلقة">
            <article><span className="detail-stat-icon detail-stat-icon--gold"><UsersRound size={18} /></span><div><b>{arabicNumber(students.length)}</b><small>طلاب الحلقة</small></div></article>
            <article><span className="detail-stat-icon detail-stat-icon--sage"><CalendarDays size={18} /></span><div><b>{arabicNumber(todaySessions)}</b><small>جلسات اليوم</small></div></article>
            <article><span className="detail-stat-icon detail-stat-icon--clay"><Sparkles size={18} /></span><div><b>{excellentRate ? `${arabicNumber(excellentRate)}٪` : "—"}</b><small>نسبة ممتاز</small></div></article>
          </section>

          <section className="detail-section">
            <div className="section-title-row">
              <div><p className="section-kicker">المتابعة اليومية</p><h2>طلاب الحلقة</h2></div>
              <button className="add-text-button" onClick={() => setShowAddStudent(true)}><UserPlus size={16} /> إضافة طالب</button>
            </div>
            <div className="halaqa-student-grid">
              {students.length ? students.map((student, index) => (
                <article className="halaqa-student-card" key={student.id}>
                  <div className="halaqa-student-card__head">
                    <span className={`avatar avatar--${index % 3 === 0 ? "gold" : index % 3 === 1 ? "sage" : "ink"}`}>{initials(student.name)}</span>
                    <span className="halaqa-student-card__actions">
                      <button aria-label={`تعديل بيانات ${student.name}`} onClick={() => startEditStudent(student)}><Pencil size={16} /></button>
                      <button aria-label={`حذف ${student.name}`} onClick={() => setPendingDelete(student)}><MoreHorizontal size={18} /></button>
                    </span>
                  </div>
                  <h3>{student.name}</h3>
                  <p className="student-status">
                    <i /> {student.lastSurah ? "آخر متابعة مسجلة" : "بانتظار أول تسجيل"}
                    {!student.lastSurah && (
                      <button type="button" className="import-position-link" onClick={() => startImportPosition(student)}>
                        <MapPin size={12} /> تحديد آخر موضع
                      </button>
                    )}
                  </p>
                  <div className="student-detail-meta">
                    <span><small>العمر</small><b>{student.age ? `${arabicNumber(student.age)} سنة` : "—"}</b></span>
                    <span><small>آخر موضع</small><b>{student.lastSurah ? `${student.lastSurah}${student.lastRange ? ` · ${student.lastRange}` : ""}` : "لم يسجل بعد"}</b></span>
                  </div>
                  <div className="halaqa-student-card__footer">
                    <span className="student-contact-meta">{student.phone ? `${student.phoneRelation ?? "ولي الأمر"}: ${student.phone}` : "لا يوجد هاتف"}</span>
                    <button onClick={() => setLocation(`/supervisor/halaqa/${halaqa.id}/student/${student.id}`)} aria-label={`فتح ملف ${student.name}`}>الملف <ChevronLeft size={15} /></button>
                  </div>
                </article>
              )) : <div className="profile-empty"><UsersRound size={24} /><p>لا يوجد طلاب في هذه الحلقة بعد.</p></div>}
            </div>
          </section>

          <section className="detail-section detail-session-panel">
            <div className="section-title-row">
              <div><p className="section-kicker">آخر النشاط</p><h2>جلسات الحلقة</h2></div>
              <button onClick={() => toast("افتح ملف الطالب لرؤية سجله الكامل")}><ClipboardPenLine size={16} /> سجل مفصل</button>
            </div>
            <div className="detail-session-list">
              {recentSessions.length ? recentSessions.map((session) => (
                <div key={session.id}>
                  <span className={`detail-session-icon ${session.kind === "review" ? "detail-session-icon--sage" : ""}`}>{session.kind === "review" ? <RefreshCcw size={17} /> : <BookOpenCheck size={17} />}</span>
                  <span><b>{session.studentName}</b><small>{session.kind === "review" ? "مراجعة" : "حفظ جديد"} · {session.date} · سورة {session.surah}</small></span>
                  <EvaluationBadge score={session.evaluation} compact />
                  <button className="session-open-button" onClick={() => setLocation(`/supervisor/halaqa/${halaqa.id}/student/${session.studentId}`)} aria-label={`فتح ملف ${session.studentName}`}><UserRound size={16} /></button>
                </div>
              )) : <div className="profile-empty"><ClipboardPenLine size={24} /><p>لا توجد جلسات مسجلة بعد.</p></div>}
            </div>
          </section>
        </>}
      </section>

      {showAddStudent && (
        <div className="modal-backdrop" role="presentation">
          <form className="mini-modal" onSubmit={submitAddStudent} role="dialog" aria-modal="true" aria-labelledby="add-student-title">
            <button type="button" className="modal-close" onClick={() => setShowAddStudent(false)} aria-label="إغلاق نافذة إضافة الطالب"><X size={20} /></button>
            <UserPlus size={24} />
            <p className="section-kicker">إدارة الحلقة</p>
            <h2 id="add-student-title">إضافة طالب جديد</h2>
            <label className="field-label" htmlFor="new-student-name">اسم الطالب<input id="new-student-name" value={studentForm.name} onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))} placeholder="الاسم الكامل" autoFocus required /></label>
            <label className="field-label" htmlFor="new-student-age">العمر (اختياري)<input id="new-student-age" type="number" min={3} max={100} value={studentForm.age} onChange={(event) => setStudentForm((current) => ({ ...current, age: event.target.value }))} placeholder="مثال: 12" /></label>
            <label className="field-label" htmlFor="new-student-phone">هاتف ولي الأمر (اختياري)<input id="new-student-phone" value={studentForm.phone} onChange={(event) => setStudentForm((current) => ({ ...current, phone: event.target.value }))} placeholder="مثال: 71234567" /></label>
            <label className="field-label" htmlFor="new-student-relation">صلة ولي الأمر (اختياري)
              <select id="new-student-relation" value={studentForm.phoneRelation} onChange={(event) => setStudentForm((current) => ({ ...current, phoneRelation: event.target.value as typeof current.phoneRelation }))}>
                <option value="">—</option>
                <option value="الأب">الأب</option>
                <option value="الأم">الأم</option>
                <option value="الأخ">الأخ</option>
              </select>
            </label>
            <button className="save-session" type="submit" disabled={saving}>{saving ? "جارٍ الحفظ…" : <><UserPlus size={18} /> حفظ الطالب</>}</button>
          </form>
        </div>
      )}

      {editingStudent && (
        <div className="modal-backdrop" role="presentation">
          <form className="mini-modal" onSubmit={submitEditStudent} role="dialog" aria-modal="true" aria-labelledby="edit-student-title">
            <button type="button" className="modal-close" onClick={() => setEditingStudent(null)} aria-label="إغلاق نافذة تعديل الطالب"><X size={20} /></button>
            <Pencil size={24} />
            <p className="section-kicker">إدارة الحلقة</p>
            <h2 id="edit-student-title">تعديل بيانات {editingStudent.name}</h2>
            <label className="field-label" htmlFor="edit-student-name">اسم الطالب<input id="edit-student-name" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} placeholder="الاسم الكامل" autoFocus required /></label>
            <label className="field-label" htmlFor="edit-student-age">العمر (اختياري)<input id="edit-student-age" type="number" min={3} max={100} value={editForm.age} onChange={(event) => setEditForm((current) => ({ ...current, age: event.target.value }))} placeholder="مثال: 12" /></label>
            <label className="field-label" htmlFor="edit-student-phone">هاتف ولي الأمر (اختياري)<input id="edit-student-phone" value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} placeholder="مثال: 71234567" /></label>
            <label className="field-label" htmlFor="edit-student-relation">صلة ولي الأمر (اختياري)
              <select id="edit-student-relation" value={editForm.phoneRelation} onChange={(event) => setEditForm((current) => ({ ...current, phoneRelation: event.target.value as typeof current.phoneRelation }))}>
                <option value="">—</option>
                <option value="الأب">الأب</option>
                <option value="الأم">الأم</option>
                <option value="الأخ">الأخ</option>
              </select>
            </label>
            <label className="field-label" htmlFor="edit-student-surah">آخر موضع — السورة
              <select id="edit-student-surah" value={editPositionSurah} onChange={(event) => { setEditPositionSurah(event.target.value); setEditPositionAyah("1"); }}>
                {SURAH_LIST.map((surah) => <option value={surah.id} key={surah.id}>{surah.id}. سورة {surah.name}</option>)}
              </select>
            </label>
            <label className="field-label" htmlFor="edit-student-ayah">آخر موضع — الآية
              <select id="edit-student-ayah" value={editPositionAyah} onChange={(event) => setEditPositionAyah(event.target.value)}>
                {ayahOptions(getSurah(editPositionSurah).ayahs).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
              </select>
            </label>
            <button className="save-session" type="submit" disabled={editSaving}>{editSaving ? "جارٍ الحفظ…" : <><Pencil size={18} /> حفظ التعديل</>}</button>
          </form>
        </div>
      )}

      {importingPosition && (
        <div className="modal-backdrop" role="presentation">
          <div className="mini-modal" role="alertdialog" aria-modal="true" aria-labelledby="import-position-title">
            <button type="button" className="modal-close" onClick={() => setImportingPosition(null)} aria-label="إغلاق نافذة تحديد الموضع"><X size={20} /></button>
            <MapPin size={24} />
            <p className="section-kicker">استيراد لمرة واحدة</p>
            <h2 id="import-position-title">تحديد موضع {importingPosition.name}</h2>
            <p className="modal-copy">
              حدّد آخر آية وصل إليها الطالب قبل انضمامه للمنصة. هذا لا يُسجَّل كجلسة تسميع بتاريخ، ولن يظهر في سجل الجلسات — فقط نقطة بداية. يمكن تحديد هذا مرة واحدة فقط لكل طالب.
            </p>
            <label className="field-label" htmlFor="import-surah">السورة
              <select id="import-surah" value={importSurah} onChange={(event) => { setImportSurah(event.target.value); setImportAyah("1"); }}>
                {SURAH_LIST.map((surah) => <option value={surah.id} key={surah.id}>{surah.id}. سورة {surah.name}</option>)}
              </select>
            </label>
            <label className="field-label" htmlFor="import-ayah">الآية
              <select id="import-ayah" value={importAyah} onChange={(event) => setImportAyah(event.target.value)}>
                {ayahOptions(getSurah(importSurah).ayahs).map((ayah) => <option value={ayah} key={ayah}>{ayah}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setImportingPosition(null)}>إلغاء</button>
              <button type="button" className="confirm-button" disabled={importSaving} onClick={() => void confirmImportPosition()}>
                <MapPin size={16} /> {importSaving ? "جارٍ الحفظ…" : "تأكيد الموضع"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation">
          <div className="mini-modal mini-modal--danger" role="alertdialog" aria-modal="true" aria-labelledby="delete-student-title">
            <button type="button" className="modal-close" onClick={() => setPendingDelete(null)} aria-label="إلغاء حذف الطالب"><X size={20} /></button>
            <Trash2 size={24} />
            <p className="section-kicker">إجراء لا يمكن التراجع عنه</p>
            <h2 id="delete-student-title">حذف الطالب؟</h2>
            <p className="modal-copy">سيُحذف <b>{pendingDelete.name}</b> وكل سجل جلساته ورابط المتابعة العائلي الخاص به نهائياً.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingDelete(null)}>إلغاء</button>
              <button type="button" className="danger-button" disabled={deleting} onClick={() => void confirmDeleteStudent()}><Trash2 size={16} /> {deleting ? "جارٍ الحذف…" : "حذف الطالب"}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteHalaqa && halaqa && (
        <div className="modal-backdrop" role="presentation">
          <div className="mini-modal mini-modal--danger" role="alertdialog" aria-modal="true" aria-labelledby="delete-halaqa-title">
            <button type="button" className="modal-close" onClick={() => setConfirmDeleteHalaqa(false)} aria-label="إلغاء حذف الحلقة"><X size={20} /></button>
            <Trash2 size={24} />
            <p className="section-kicker">إجراء لا يمكن التراجع عنه</p>
            <h2 id="delete-halaqa-title">حذف الحلقة؟</h2>
            <p className="modal-copy">
              سيُحذف <b>{halaqa.name}</b> نهائياً مع <b>{arabicNumber(students.length)} طالباً</b> وكل سجلات جلساتهم وروابط المتابعة العائلية الخاصة بهم.
            </p>
            <label className="field-label" htmlFor="delete-halaqa-confirm">اكتب اسم الحلقة للتأكيد
              <input id="delete-halaqa-confirm" value={deleteHalaqaConfirmText} onChange={(event) => setDeleteHalaqaConfirmText(event.target.value)} placeholder={halaqa.name} autoFocus />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setConfirmDeleteHalaqa(false)}>إلغاء</button>
              <button type="button" className="danger-button" disabled={deletingHalaqa || deleteHalaqaConfirmText.trim() !== halaqa.name} onClick={() => void confirmDeleteHalaqaAction()}>
                <Trash2 size={16} /> {deletingHalaqa ? "جارٍ الحذف…" : "حذف الحلقة نهائياً"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
