import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { BrandLockup, BrandMark } from "@/components/BrandMark";
import { isDemoMode, signInWithUsername } from "@/lib/firebase";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("يرجى إدخال اسم المستخدم وكلمة المرور.");
      return;
    }
    setBusy(true);
    setError("");

    if (isDemoMode) {
      window.setTimeout(() => {
        setLocation(/مشرف|admin|supervisor/i.test(username.trim()) ? "/supervisor" : "/teacher");
      }, 650);
      return;
    }

    const result = await signInWithUsername(username, password);
    if (!result.ok) {
      // A network/service failure is never treated as a wrong-credentials signal — conflating the
      // two would tell a legitimate user their password is wrong (and nudge them toward retries
      // that trip the lockout) when the real problem is connectivity.
      setError(
        result.reason === "network"
          ? "تعذّر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مرة أخرى."
          : "اسم المستخدم أو كلمة المرور غير صحيحة.",
      );
      setBusy(false);
      return;
    }
    setLocation(result.role === "supervisor" ? "/supervisor" : "/teacher");
  };

  return (
    <main className="login-page" dir="rtl">
      <div className="login-page__image" aria-hidden="true" />
      <div className="login-page__shade" aria-hidden="true" />
      <section className="login-story maq-reveal">
        <BrandLockup className="brand-lockup--light" />
        <div className="login-story__copy"><p>منصة متابعة الحفظ</p><h1>كل جلسةٍ تحفظ<br />أثرها الجميل.</h1><span /></div>
        <div className="login-story__footer"><ShieldCheck size={18} /> خصوصية الطلاب وسجل الحفظ أمانة</div>
      </section>

      <section className="login-panel maq-reveal maq-delay-1">
        <button className="back-link" onClick={() => setLocation("/")}><ArrowLeft size={17} /> العودة لسجل الطالب</button>
        <div className="login-panel__mark"><BrandMark size={48} /></div>
        <p className="section-kicker">دخول محمي</p>
        <h2>أهلاً بعودتك</h2>
        <p className="login-panel__sub">دخول المعلّمين والمشرفين</p>

        <form onSubmit={handleSubmit} noValidate>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <label className="form-field"><span>اسم المستخدم</span><div><UserRound size={18} /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="off" placeholder="اكتب اسم المستخدم" /></div></label>
          <label className="form-field"><span>كلمة المرور</span><div><LockKeyhole size={18} /><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="أدخل كلمة المرور" /><button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <button className="form-submit" type="submit" disabled={busy}>{busy ? "جارٍ التحقق…" : <>تسجيل الدخول <ArrowLeft size={18} /></>}</button>
        </form>
        <div className="session-note"><ShieldCheck size={17} /><span>سينتهي تسجيل دخولك تلقائياً بعد <b>٢٠ دقيقة</b> من عدم النشاط.</span></div>
        {isDemoMode && <p className="demo-note">وضع العرض التجريبي: اكتب <b>مشرف</b> لفتح لوحة المشرف، أو أي اسم لفتح لوحة المعلم.</p>}
      </section>
    </main>
  );
}
