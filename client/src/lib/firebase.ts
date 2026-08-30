import { deleteApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { completedJuzCount, getSurah } from "@/lib/quran";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const MINIMUM_LOGIN_RESPONSE_MS = 850;

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);
export const isDemoMode = !firebaseConfigured;

export const firebaseApp = firebaseConfigured
  ? (getApps().find((app) => app.name === "[DEFAULT]") ?? initializeApp(firebaseConfig))
  : null;
export const firestore = firebaseApp ? getFirestore(firebaseApp) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

if (firebaseApp && appCheckSiteKey) {
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export type AppRole = "teacher" | "supervisor";
export type SessionKind = "memorization" | "review";
export type Evaluation = "ممتاز" | "جيد جداً" | "جيد" | "إعادة";

type LoginResult =
  | { ok: true; role: AppRole; halaqaId?: string; username: string }
  | { ok: false; reason?: "network" };
type LoginAttempt = { attempts?: number; lockedUntil?: Timestamp | null };

/**
 * True for connectivity/service errors (offline, timeout, rate-limited by Firebase itself, etc.),
 * as opposed to a genuine credential rejection. A transient network blip must never count toward
 * the 5-attempt lockout — that would eventually lock out a legitimate user for a problem that had
 * nothing to do with their password.
 */
function isNetworkOrServiceError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null ? String((error as { code?: unknown }).code ?? "") : "";
  return [
    "auth/network-request-failed",
    "auth/too-many-requests",
    "auth/internal-error",
    "unavailable",
    "deadline-exceeded",
    "cancelled",
  ].some((networkCode) => code.includes(networkCode));
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const normalizeUsername = (username: string) => username.trim().toLocaleLowerCase("en-US");

async function stableIdentifier(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** High-entropy opaque token for public QR capability links (43 base64url chars ≈ 256 bits). */
export function generatePublicId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "p_" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 48);
}

async function recordFailure(identifier: string) {
  if (!firestore) return;
  const attemptRef = doc(firestore, "loginAttempts", identifier);
  await runTransaction(firestore, async (transaction) => {
    const existing = await transaction.get(attemptRef);
    const current = existing.exists() ? ((existing.data() as LoginAttempt).attempts ?? 0) : 0;
    const next = Math.min(current + 1, 5);
    const lockedUntil = next >= 5 ? Timestamp.fromMillis(Date.now() + 5 * 60 * 1000) : null;
    transaction.set(attemptRef, { attempts: next, lockedUntil, updatedAt: serverTimestamp() }, { merge: true });
  });
}

/**
 * Resets the lockout counter after a successful login. Only ever *updates* an existing doc — never
 * creates one — because the rules' create branch requires `attempts == 1` (a real failure) to keep a
 * client from being able to write an arbitrary attempts/lockedUntil combination from scratch; if this
 * identifier has no prior failed attempts there is nothing to clear, so it's a no-op instead.
 */
async function clearFailures(identifier: string, hadPriorAttempt: boolean) {
  if (!firestore || !hadPriorAttempt) return;
  await setDoc(
    doc(firestore, "loginAttempts", identifier),
    { attempts: 0, lockedUntil: null, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Resolves the internal synthetic email from a case-insensitive username, then
 * signs in using local browser persistence. All failed paths share one result
 * and a minimum response time to reduce username enumeration signals.
 */
export async function signInWithUsername(username: string, password: string): Promise<LoginResult> {
  if (!firebaseAuth || !firestore) return { ok: false };
  const startedAt = performance.now();
  const normalized = normalizeUsername(username);
  const identifier = await stableIdentifier(normalized);
  const attemptRef = doc(firestore, "loginAttempts", identifier);

  try {
    const priorAttempt = await getDoc(attemptRef);
    const attemptData = priorAttempt.exists() ? (priorAttempt.data() as LoginAttempt) : null;
    if (attemptData?.lockedUntil?.toMillis() && attemptData.lockedUntil.toMillis() > Date.now()) {
      await wait(Math.max(0, MINIMUM_LOGIN_RESPONSE_MS - (performance.now() - startedAt)));
      return { ok: false };
    }

    const usernameDoc = await getDoc(doc(firestore, "usernames", normalized));
    const email = usernameDoc.exists() ? String(usernameDoc.data().email ?? "") : "";
    await setPersistence(firebaseAuth, browserLocalPersistence);

    // Unknown usernames follow the same auth route with a non-existent address.
    await signInWithEmailAndPassword(
      firebaseAuth,
      email || `missing-${identifier.slice(0, 18)}@invalid.local`,
      password,
    );

    const uid = firebaseAuth.currentUser!.uid;
    const userDoc = await getDoc(doc(firestore, "users", uid));
    const data = userDoc.exists() ? userDoc.data() : null;
    const role = data?.role;
    if (role !== "teacher" && role !== "supervisor") {
      await signOut(firebaseAuth);
      throw new Error("No supported application role");
    }

    await clearFailures(identifier, priorAttempt.exists());
    await wait(Math.max(0, MINIMUM_LOGIN_RESPONSE_MS - (performance.now() - startedAt)));
    return { ok: true, role, halaqaId: data?.halaqaId, username: normalized };
  } catch (error) {
    const isNetworkIssue = isNetworkOrServiceError(error);
    if (!isNetworkIssue) {
      try {
        await recordFailure(identifier);
      } catch {
        /* Never reveal rule or network details in the login UI. */
      }
    }
    await wait(Math.max(0, MINIMUM_LOGIN_RESPONSE_MS - (performance.now() - startedAt)));
    return isNetworkIssue ? { ok: false, reason: "network" } : { ok: false };
  }
}

export function watchAuthState(callback: (user: User | null) => void) {
  if (!firebaseAuth) return () => undefined;
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function fetchCurrentUserProfile(uid: string) {
  if (!firestore) return null;
  const snap = await getDoc(doc(firestore, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as { role: AppRole; halaqaId?: string; username: string };
  return { uid, role: data.role, halaqaId: data.halaqaId, username: data.username };
}

export async function signOutCurrentUser() {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
}

/** Creates a teacher's hidden email/password account without replacing the signed-in supervisor session. */
export async function provisionTeacherAccount(input: { username: string; password: string; halaqaId: string }) {
  if (!firebaseApp || !firebaseConfig.projectId || !firebaseAuth || !firestore || !firebaseAuth.currentUser) {
    throw new Error("Firebase is not ready.");
  }
  const username = normalizeUsername(input.username);
  const email = `${username}@${firebaseConfig.projectId}.local`;
  const secondaryName = `teacher-provision-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, input.password);
    await setDoc(doc(firestore, "users", credential.user.uid), { role: "teacher", halaqaId: input.halaqaId, username });
    await setDoc(doc(firestore, "usernames", username), { email });
    return credential.user.uid;
  } finally {
    await signOut(secondaryAuth).catch(() => undefined);
    await deleteApp(secondaryApp).catch(() => undefined);
  }
}

/** Generates a hard-to-guess password for a freshly-provisioned teacher account. */
export function createTemporaryPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

export type TeacherAccount = { uid: string; username: string; halaqaId: string };

export async function getTeacherAccounts(): Promise<TeacherAccount[]> {
  if (!firestore) return [];
  const snapshot = await getDocs(collection(firestore, "users"));
  return snapshot.docs
    .map((item) => ({ uid: item.id, ...(item.data() as DocumentData) }) as TeacherAccount & { role?: string })
    .filter((item): item is TeacherAccount & { role?: string } => item.role === "teacher" && Boolean(item.username && item.halaqaId))
    .map(({ uid, username, halaqaId }) => ({ uid, username, halaqaId }));
}

/** Removes application access (the `users` role doc and the `usernames` lookup); the underlying
 * Firebase Auth identity is left in place and can be deleted permanently from the console if needed. */
export async function removeTeacherAccess(account: TeacherAccount) {
  if (!firestore || !firebaseAuth?.currentUser) throw new Error("Supervisor session required.");
  await deleteDoc(doc(firestore, "users", account.uid));
  await deleteDoc(doc(firestore, "usernames", account.username));
}

/** Lets the signed-in teacher change their own password directly — no paid plan needed for this. */
export async function changeCurrentPassword(newPassword: string) {
  if (!firebaseAuth?.currentUser) throw new Error("Teacher session required.");
  await updatePassword(firebaseAuth.currentUser, newPassword);
}

/** Starts a client-side inactivity timer for protected application routes. */
export function startIdleLogout(onTimeout: () => void, timeoutMs = IDLE_TIMEOUT_MS) {
  if (!firebaseAuth) return () => undefined;
  let timeoutId: number;
  const restart = () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(async () => {
      await signOut(firebaseAuth).catch(() => undefined);
      onTimeout();
    }, timeoutMs);
  };
  const events: Array<keyof WindowEventMap> = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
  events.forEach((event) => window.addEventListener(event, restart, { passive: true }));
  restart();
  return () => {
    window.clearTimeout(timeoutId);
    events.forEach((event) => window.removeEventListener(event, restart));
  };
}

// ---------------------------------------------------------------------------
// Halaqat / students / sessions data access
// ---------------------------------------------------------------------------

export type Halaqa = { id: string; name: string; order: number; teacherName?: string };
export type Student = {
  id: string;
  name: string;
  publicId: string;
  halaqaId: string;
  age?: number;
  phone?: string;
  phoneRelation?: string;
  lastSurah?: string;
  lastRange?: string;
  readingNote?: string;
};
export type Session = {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  surah: number;
  ayahFrom: number;
  ayahTo: number;
  evaluation: Evaluation;
  nextSurah: number;
  nextAyahFrom: number;
  nextAyahTo: number;
  kind: SessionKind;
  reviewNote?: string;
  createdBy: string;
  updatedBy: string;
};
export type PublicStudent = {
  publicId: string;
  studentId: string;
  halaqaId: string;
  halaqaName?: string;
  teacherName?: string;
  name: string;
  sessionDates: string[];
  completedParts: number;
  furthestSurah: number;
  furthestAyah: number;
  streak: number;
  sessionsCount: number;
  reviewCount: number;
};
export type PublicSession = {
  sourceSessionId: string;
  halaqaId: string;
  studentId: string;
  date: string;
  surah: number;
  ayahFrom: number;
  ayahTo: number;
  evaluation: Evaluation;
  nextSurah: number;
  nextAyahFrom: number;
  nextAyahTo: number;
  kind: SessionKind;
  reviewNote?: string;
};

const requireDb = () => {
  if (!firestore) throw new Error("Firebase is not configured.");
  return firestore;
};

export async function listHalaqat(): Promise<Halaqa[]> {
  const db = requireDb();
  const snap = await getDocs(query(collection(db, "halaqat"), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as Halaqa);
}

export async function getHalaqa(halaqaId: string): Promise<Halaqa | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, "halaqat", halaqaId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as DocumentData) } as Halaqa;
}

export async function createHalaqa(input: { name: string; order: number; teacherName?: string }) {
  const db = requireDb();
  const ref = doc(collection(db, "halaqat"));
  // The rules require `teacherName` on every halaqa doc (a non-empty, bounded-length string, same
  // as Manus's original design) — the add-halaqa form only ever asks for a name, so default it here,
  // exactly like Manus's own mock `addHalaqa` did, rather than at each call site. Omitting it isn't a
  // permissions problem the way the caller's generic catch reports it — it's a write that the rules
  // always rejected outright because the doc it tried to create was missing a required field.
  const teacherName = input.teacherName?.trim() || "لم يُعيّن معلّم بعد";
  await setDoc(ref, { name: input.name, order: input.order, teacherName });
  return ref.id;
}

/**
 * Deletes a halaqa and every student in it — each student goes through the exact same cascade as
 * `deleteStudent` below (sessions, public session mirrors, public profile), so nothing is left
 * orphaned. This is deliberately not exposed anywhere the supervisor could reach it by accident:
 * the calling UI is expected to show the real student count and require an explicit confirmation
 * naming the halaqa, the same way a destructive action of this size should.
 */
export async function deleteHalaqa(halaqaId: string) {
  const db = requireDb();
  const studentsSnap = await getDocs(collection(db, "halaqat", halaqaId, "students"));
  for (const studentDoc of studentsSnap.docs) {
    await deleteStudent(halaqaId, { id: studentDoc.id, halaqaId, ...(studentDoc.data() as DocumentData) } as Student);
  }
  await deleteDoc(doc(db, "halaqat", halaqaId));
}

export async function listStudents(halaqaId: string): Promise<Student[]> {
  const db = requireDb();
  const snap = await getDocs(collection(db, "halaqat", halaqaId, "students"));
  return snap.docs.map((d) => ({ id: d.id, halaqaId, ...(d.data() as DocumentData) }) as Student);
}

/**
 * Creates a student and, in the same operation, their `/publicStudents/{publicId}` QR profile —
 * eagerly, not lazily on their first session. A freshly-generated QR code otherwise encodes a link
 * to a document that doesn't exist yet, which resolves as "record not found" until the student's
 * first session is logged; that reads to a family scanning the code as "the QR doesn't work."
 */
export async function createStudent(input: {
  halaqaId: string;
  name: string;
  age?: number;
  phone?: string;
  phoneRelation?: string;
}) {
  const db = requireDb();
  const publicId = generatePublicId();
  const ref = doc(collection(db, "halaqat", input.halaqaId, "students"));
  const data: Record<string, unknown> = { name: input.name, publicId, halaqaId: input.halaqaId };
  if (input.age) data.age = input.age;
  if (input.phone) data.phone = input.phone;
  if (input.phoneRelation) data.phoneRelation = input.phoneRelation;

  const halaqa = await getHalaqa(input.halaqaId);
  const publicStudent: PublicStudent = {
    publicId,
    studentId: ref.id,
    halaqaId: input.halaqaId,
    ...(halaqa?.name ? { halaqaName: halaqa.name } : {}),
    ...(halaqa?.teacherName ? { teacherName: halaqa.teacherName } : {}),
    name: input.name,
    sessionDates: [],
    completedParts: 0,
    furthestSurah: 0,
    furthestAyah: 0,
    streak: 0,
    sessionsCount: 0,
    reviewCount: 0,
  };

  const batch = writeBatch(db);
  batch.set(ref, data);
  batch.set(doc(db, "publicStudents", publicId), { ...publicStudent, updatedAt: serverTimestamp() });
  await batch.commit();
  return { id: ref.id, publicId };
}

/**
 * Edits a student's own details in place — the supervisor previously had no way to fix a typo'd
 * name or an outdated phone number short of deleting the student and re-adding them, which throws
 * away their whole session history and QR link. An empty optional field clears it (`deleteField()`)
 * rather than writing an empty string, matching `validStudent`'s rule that these fields are either a
 * real value or absent entirely, never blank.
 */
export async function updateStudent(halaqaId: string, student: Student, patch: { name: string; age?: number; phone?: string; phoneRelation?: string; lastSurah?: string; lastRange?: string }) {
  const db = requireDb();
  await updateDoc(doc(db, "halaqat", halaqaId, "students", student.id), {
    name: patch.name,
    age: patch.age ?? deleteField(),
    phone: patch.phone || deleteField(),
    phoneRelation: patch.phoneRelation || deleteField(),
    // Unlike the fields above, an unset lastSurah/lastRange here means "the edit form didn't touch
    // this", not "clear it" — the supervisor can now correct a student's last position at any time,
    // not just through the one-time import, so omitting it must leave whatever is already there alone.
    ...(patch.lastSurah ? { lastSurah: patch.lastSurah } : {}),
    ...(patch.lastRange ? { lastRange: patch.lastRange } : {}),
  });

  // The family's QR page reads the name from the public mirror, not the private doc — without this
  // it would keep showing the old name until the next session happened to be saved.
  if (patch.name !== student.name) {
    await updateDoc(doc(db, "publicStudents", student.publicId), { name: patch.name, updatedAt: serverTimestamp() }).catch(() => undefined);
  }
}

/**
 * One-time import of a student's real-world starting position (surah + ayah) for students who
 * already had progress before joining the app — deliberately writes only `lastSurah`/`lastRange`,
 * never a dated session: this is a starting point the supervisor is declaring, not something that
 * happened today, so it must not appear in the session history, count toward the streak, or affect
 * achievement progress the way a real logged session would. Only callable once per student — the
 * calling UI is expected to hide this action once `lastSurah` is already set.
 */
export async function importStudentStartingPosition(halaqaId: string, studentId: string, position: { lastSurah: string; lastRange: string }) {
  const db = requireDb();
  await updateDoc(doc(db, "halaqat", halaqaId, "students", studentId), position);
}

/**
 * Deletes a student and everything that references them. Firestore never cascade-deletes
 * subcollections on its own — without this, the student's session history would sit orphaned
 * forever, and worse, their `/publicStudents/{publicId}` QR profile (and its own sessions) would
 * keep resolving and showing the family stale data indefinitely instead of "record not found".
 */
export async function deleteStudent(halaqaId: string, student: Student) {
  const db = requireDb();
  const sessionsSnap = await getDocs(collection(db, "halaqat", halaqaId, "students", student.id, "sessions"));
  await Promise.all(sessionsSnap.docs.map((sessionDoc) => deleteDoc(sessionDoc.ref)));

  // The public mirror's `sessions` subcollection has `list: false` in the rules on purpose — it's an
  // opaque QR profile, and letting anyone enumerate it would leak a student's full attendance history
  // to a scraper. So we can't `getDocs()` it here even as staff. Instead we delete each public session
  // doc by ID directly: both `saveSession` and `syncPublicRollup` always use the ISO date string as the
  // doc ID (see `sessionId = input.existingSessionId ?? input.date`), and a private session's own ID is
  // that same date whenever it was created as new rather than edited — so `sessionDoc.data().date` (not
  // `sessionDoc.id`) is the value guaranteed to match the public doc's ID in every case.
  // Best-effort, same as elsewhere: a missing/already-gone mirror must never abort the rest of the
  // cascade or block the actual student deletion below.
  await Promise.all(
    sessionsSnap.docs
      .map((sessionDoc) => (sessionDoc.data() as DocumentData).date as string | undefined)
      .filter((date): date is string => Boolean(date))
      .map((date) => deleteDoc(doc(db, "publicStudents", student.publicId, "sessions", date)).catch(() => undefined)),
  );
  await deleteDoc(doc(db, "publicStudents", student.publicId)).catch(() => undefined);

  await deleteDoc(doc(db, "halaqat", halaqaId, "students", student.id));
}

/** Cheapest possible read for "has this student got a session today / when was their last one" UI. */
export async function getLatestSession(halaqaId: string, studentId: string): Promise<Session | null> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, "halaqat", halaqaId, "students", studentId, "sessions"), orderBy("date", "desc"), limit(1)),
  );
  const first = snap.docs[0];
  return first ? ({ id: first.id, studentId, ...(first.data() as DocumentData) } as Session) : null;
}

export async function listSessions(halaqaId: string, studentId: string, maxCount?: number): Promise<Session[]> {
  const db = requireDb();
  const base = query(collection(db, "halaqat", halaqaId, "students", studentId, "sessions"), orderBy("date", "desc"));
  const snap = await getDocs(maxCount ? query(base, limit(maxCount)) : base);
  return snap.docs.map((d) => ({ id: d.id, studentId, ...(d.data() as DocumentData) }) as Session);
}

export type StudentProfile = Student & { halaqaName: string; teacherName: string; sessions: Session[] };

/** The supervisor's internal, full-detail view of one student — contact info, real name, full
 * session history — as opposed to the public QR page, which never exposes contact details. */
export async function getStudentProfile(halaqaId: string, studentId: string): Promise<StudentProfile | null> {
  const db = requireDb();
  const [halaqaSnap, studentSnap] = await Promise.all([
    getDoc(doc(db, "halaqat", halaqaId)),
    getDoc(doc(db, "halaqat", halaqaId, "students", studentId)),
  ]);
  if (!halaqaSnap.exists() || !studentSnap.exists()) return null;
  const sessions = await listSessions(halaqaId, studentId);
  const halaqaData = halaqaSnap.data() as DocumentData;
  return {
    id: studentId,
    halaqaId,
    ...(studentSnap.data() as DocumentData),
    halaqaName: String(halaqaData.name ?? halaqaId),
    teacherName: String(halaqaData.teacherName ?? "لم يُعيّن معلّم بعد"),
    sessions,
  } as StudentProfile;
}

/**
 * Fully recomputes a student's public (QR) rollup document from their real session history — an
 * O(N) read of every session they've ever had. Used only where that's unavoidable (a deletion can
 * shrink the furthest position or the streak in ways nothing short of a full recompute can know),
 * never on the far hotter save path — see `applyRollupDelta` below for that one.
 */
async function recomputePublicRollupFromHistory(halaqaId: string, student: Student) {
  const db = requireDb();
  const halaqa = await getHalaqa(halaqaId);
  const sessions = await listSessions(halaqaId, student.id);
  const sessionDates = Array.from(new Set(sessions.map((s) => s.date))).sort().slice(-365);
  const furthest = sessions.reduce(
    (acc, s) => (s.surah > acc.surah || (s.surah === acc.surah && s.ayahTo > acc.ayah) ? { surah: s.surah, ayah: s.ayahTo } : acc),
    { surah: 0, ayah: 0 },
  );
  const publicStudent: PublicStudent = {
    publicId: student.publicId,
    studentId: student.id,
    halaqaId,
    ...(halaqa?.name ? { halaqaName: halaqa.name } : {}),
    ...(halaqa?.teacherName ? { teacherName: halaqa.teacherName } : {}),
    name: student.name,
    sessionDates,
    completedParts: completedJuzCount(furthest.surah, furthest.ayah),
    furthestSurah: furthest.surah,
    furthestAyah: furthest.ayah,
    streak: computeStreak(sessionDates),
    sessionsCount: sessions.length,
    reviewCount: sessions.filter((s) => s.kind === "review").length,
  };
  // Firestore's setDoc rejects `undefined` field values outright — every optional field above is
  // included only when it has a real value, never assigned `undefined`.
  await setDoc(doc(db, "publicStudents", student.publicId), { ...publicStudent, updatedAt: serverTimestamp() });
  return publicStudent;
}

/**
 * Updates a student's public (QR) rollup document for one saved session, without re-reading their
 * entire session history. The old `syncPublicRollup` re-fetched and re-scanned every session the
 * student ever had on every single save — cheap for a new student, but it got slower the longer a
 * student had been in the maqraa, and was the real cause behind "saving a session takes a long time."
 * This reads only the small rollup doc itself (already tracking `sessionDates`, so no extra fetch is
 * needed to recompute the streak) plus the two new `furthestSurah`/`furthestAyah` fields that let the
 * completed-parts count advance without needing the full history either. The one accepted tradeoff:
 * correcting a session to an *earlier* surah/ayah than previously recorded won't retreat the furthest
 * position — an edit like that is rare, and the alternative (a full recompute on every save) is the
 * exact slowness this replaces. `previousKind` lets an edit that changes حفظ↔مراجعة keep `reviewCount`
 * correct without re-scanning anything.
 */
async function applyRollupDelta(
  halaqaId: string,
  student: Student,
  session: { date: string; surah: number; ayahTo: number; kind: SessionKind },
  options: { isNewSession: boolean; previousKind?: SessionKind },
) {
  const db = requireDb();
  const publicRef = doc(db, "publicStudents", student.publicId);
  const existingSnap = await getDoc(publicRef);
  const prev = existingSnap.exists() ? (existingSnap.data() as Partial<PublicStudent>) : undefined;

  const sessionDates = Array.from(new Set([...(prev?.sessionDates ?? []), session.date])).sort().slice(-365);
  const prevFurthestSurah = prev?.furthestSurah ?? 0;
  const prevFurthestAyah = prev?.furthestAyah ?? 0;
  const advances = session.surah > prevFurthestSurah || (session.surah === prevFurthestSurah && session.ayahTo > prevFurthestAyah);
  const furthestSurah = advances ? session.surah : prevFurthestSurah;
  const furthestAyah = advances ? session.ayahTo : prevFurthestAyah;

  const reviewDelta = options.isNewSession
    ? (session.kind === "review" ? 1 : 0)
    : (session.kind === "review" ? 1 : 0) - (options.previousKind === "review" ? 1 : 0);

  const publicStudent: PublicStudent = {
    publicId: student.publicId,
    studentId: student.id,
    halaqaId,
    ...(prev?.halaqaName ? { halaqaName: prev.halaqaName } : {}),
    ...(prev?.teacherName ? { teacherName: prev.teacherName } : {}),
    name: student.name,
    sessionDates,
    completedParts: completedJuzCount(furthestSurah, furthestAyah),
    furthestSurah,
    furthestAyah,
    streak: computeStreak(sessionDates),
    sessionsCount: (prev?.sessionsCount ?? 0) + (options.isNewSession ? 1 : 0),
    reviewCount: Math.max(0, (prev?.reviewCount ?? 0) + reviewDelta),
  };
  await setDoc(publicRef, { ...publicStudent, updatedAt: serverTimestamp() });
  return publicStudent;
}

/**
 * Saves a memorization/review session for a student, then syncs the public (QR) rollup document
 * so the family view updates immediately. Both writes run under the signed-in teacher/supervisor's
 * own permissions — there is no server-side function (Firebase Spark plan has none) to do this instead.
 */
export async function saveSession(input: {
  halaqaId: string;
  student: Student;
  date: string;
  surah: number;
  ayahFrom: number;
  ayahTo: number;
  evaluation: Evaluation;
  nextSurah: number;
  nextAyahFrom: number;
  nextAyahTo: number;
  kind: SessionKind;
  reviewNote?: string;
  uid: string;
  existingSessionId?: string;
  existingCreatedBy?: string;
}) {
  const db = requireDb();
  const sessionId = input.existingSessionId ?? input.date;
  const sessionRef = doc(db, "halaqat", input.halaqaId, "students", input.student.id, "sessions", sessionId);

  // When editing an existing session to a different date, the public mirror we're about to write
  // lands under the *new* date's doc ID (see applyRollupDelta below) — the mirror sitting under the
  // old date would otherwise never get cleaned up and would keep showing that stale session forever
  // to anyone with the public link. Read the pre-edit date and kind (for the review-count delta) so
  // we know what's changing, from the one read we'd need for the date check anyway.
  let previousDate: string | undefined;
  let previousKind: SessionKind | undefined;
  if (input.existingSessionId) {
    const existingSnap = await getDoc(sessionRef);
    const existingData = existingSnap.data() as DocumentData | undefined;
    previousDate = existingData?.date as string | undefined;
    previousKind = existingData?.kind as SessionKind | undefined;
  }

  const sessionData: Record<string, unknown> = {
    studentId: input.student.id,
    studentName: input.student.name,
    date: input.date,
    surah: input.surah,
    ayahFrom: input.ayahFrom,
    ayahTo: input.ayahTo,
    evaluation: input.evaluation,
    nextSurah: input.nextSurah,
    nextAyahFrom: input.nextAyahFrom,
    nextAyahTo: input.nextAyahTo,
    kind: input.kind,
    createdBy: input.existingCreatedBy ?? input.uid,
    updatedBy: input.uid,
    updatedAt: serverTimestamp(),
  };
  if (input.reviewNote) sessionData.reviewNote = input.reviewNote;
  await setDoc(sessionRef, sessionData);

  const publicSession: PublicSession = {
    sourceSessionId: sessionId,
    halaqaId: input.halaqaId,
    studentId: input.student.id,
    date: input.date,
    surah: input.surah,
    ayahFrom: input.ayahFrom,
    ayahTo: input.ayahTo,
    evaluation: input.evaluation,
    nextSurah: input.nextSurah,
    nextAyahFrom: input.nextAyahFrom,
    nextAyahTo: input.nextAyahTo,
    kind: input.kind,
  };
  if (input.reviewNote) publicSession.reviewNote = input.reviewNote;
  await setDoc(doc(db, "publicStudents", input.student.publicId, "sessions", input.date), {
    ...publicSession,
    updatedAt: serverTimestamp(),
  });

  await applyRollupDelta(
    input.halaqaId,
    input.student,
    { date: input.date, surah: input.surah, ayahTo: input.ayahTo, kind: input.kind },
    { isNewSession: !input.existingSessionId, previousKind },
  );

  // Best-effort: Firestore's security rules treat `resource` as null for a doc that's already
  // gone, and a teacher's branch of the delete rule has to read `resource.data.halaqaId` — so
  // deleting an already-missing mirror denies instead of no-op'ing. That's just a quirk of the
  // rules engine, not a real authorization failure, and this step is pure cleanup: never let it
  // fail the session save the user actually asked for.
  if (previousDate && previousDate !== input.date) {
    await deleteDoc(doc(db, "publicStudents", input.student.publicId, "sessions", previousDate)).catch(() => undefined);
  }

  return sessionId;
}

export async function deleteSession(halaqaId: string, student: Student, sessionId: string) {
  const db = requireDb();
  const existingSnap = await getDoc(doc(db, "halaqat", halaqaId, "students", student.id, "sessions", sessionId));
  const date = (existingSnap.data() as DocumentData | undefined)?.date as string | undefined;

  await deleteDoc(doc(db, "halaqat", halaqaId, "students", student.id, "sessions", sessionId));
  // Remove the public mirror of this exact session too — otherwise it stays reachable at its old
  // date on the public link forever, even though the real session record is gone. Fall back to
  // `sessionId` itself when the doc is already gone (e.g. a retry after a partial failure), since
  // for a never-edited session the ID and the date are the same string by construction. Best-effort
  // for the same reason as above: the private delete above is the part the user is waiting on, and
  // it has already succeeded by this point — a missing/already-gone mirror must never turn that
  // real success into a reported failure.
  await deleteDoc(doc(db, "publicStudents", student.publicId, "sessions", date ?? sessionId)).catch(() => undefined);
  // Deleting is rare enough (unlike every routine save) that the full recompute's cost is fine —
  // and here it's the only correct option, since removing a session can retreat the furthest
  // position or shorten the streak in ways a cheap delta can't know without the full history.
  await recomputePublicRollupFromHistory(halaqaId, student);
}

/** Consecutive-day streak ending at the most recent date in a sorted, deduped ISO date list. */
export function computeStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let streak = 1;
  for (let i = sortedDates.length - 1; i > 0; i -= 1) {
    const current = new Date(`${sortedDates[i]}T12:00:00`);
    const previous = new Date(`${sortedDates[i - 1]}T12:00:00`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / 86_400_000);
    if (diffDays === 1) streak += 1;
    else break;
  }
  return streak;
}

export async function fetchPublicStudent(publicId: string): Promise<PublicStudent | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, "publicStudents", publicId));
  if (!snap.exists()) return null;
  return snap.data() as PublicStudent;
}

export function watchPublicStudent(publicId: string, callback: (student: PublicStudent | null) => void) {
  const db = requireDb();
  return onSnapshot(doc(db, "publicStudents", publicId), (snap) => {
    callback(snap.exists() ? (snap.data() as PublicStudent) : null);
  });
}

export async function fetchPublicSession(publicId: string, date: string): Promise<PublicSession | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, "publicStudents", publicId, "sessions", date));
  if (!snap.exists()) return null;
  return snap.data() as PublicSession;
}

export { getSurah };
