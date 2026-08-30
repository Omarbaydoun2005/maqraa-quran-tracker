/** A short dhikr, picked afresh each time a page opens — rotates between tasbih, tahmid, and
 * salah upon the Prophet ﷺ. `pickRandomDhikr()` is meant to be called once per mount (e.g. inside a
 * `useState(pickRandomDhikr)` lazy initializer) so it stays fixed for that viewing, not per render. */
export const DHIKR_PHRASES = [
  "سُبْحَانَ اللهِ وَبِحَمْدِهِ",
  "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
  "اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ",
];

export function pickRandomDhikr() {
  return DHIKR_PHRASES[Math.floor(Math.random() * DHIKR_PHRASES.length)];
}

export type HadithRef = { text: string; sourceLabel: string; sourceHref: string };

/** Shown on the student's own record page and the supervisor's dashboard. */
export const ENVY_HADITH: HadithRef = {
  text: "قال رسول الله ﷺ: «لا حَسَدَ إلَّا في اثْنَتَيْنِ: رَجُلٌ آتَاهُ اللَّهُ القُرْآنَ فَهو يَقُومُ به آنَاءَ اللَّيْلِ وآنَاءَ النَّهَارِ، ورَجُلٌ آتَاهُ اللَّهُ مَالًا فَهو يُنْفِقُهُ آنَاءَ اللَّيْلِ وآنَاءَ النَّهَارِ».",
  sourceLabel: "المصدر: صحيح البخاري، حديث ١٤٠٩",
  sourceHref: "https://sunnah.com/bukhari:1409",
};

/** Shown on the teacher's dashboard — about teaching the Qur'an specifically, narrated from
 * Uthman ibn Affan (رضي الله عنه). */
export const TEACHER_HADITH: HadithRef = {
  text: "عن عثمان بن عفان: قال رسول الله ﷺ: «خَيْرُكُمْ مَنْ تَعَلَّمَ القُرْآنَ وَعَلَّمَهُ».",
  sourceLabel: "المصدر: صحيح البخاري، حديث ٥٠٢٧",
  sourceHref: "https://sunnah.com/bukhari:5027",
};
