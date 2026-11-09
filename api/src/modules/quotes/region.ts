// Which Saudi region a pickup address is in, so customers are offered the companies that work there.
// Matches the city / district / address text (Arabic or English) against the cities of each region.

const REGIONS: Record<string, string[]> = {
  'منطقة الرياض': ['الرياض', 'الخرج', 'الدرعية', 'المجمعة', 'الزلفي', 'riyadh', 'kharj', 'diriyah'],
  'منطقة مكة المكرمة': ['مكة', 'جدة', 'الطائف', 'رابغ', 'القنفذة', 'makkah', 'mecca', 'jeddah', 'jiddah', 'taif'],
  'المنطقة الشرقية': ['الدمام', 'الخبر', 'الظهران', 'الجبيل', 'الهفوف', 'الأحساء', 'الاحساء', 'القطيف', 'حفر الباطن', 'الخفجي',
    'dammam', 'khobar', 'dhahran', 'jubail', 'hofuf', 'hafuf', 'ahsa', 'hasa', 'qatif', 'hafar'],
  'منطقة المدينة المنورة': ['المدينة المنورة', 'المدينه المنوره', 'ينبع', 'العلا', 'madinah', 'medina', 'yanbu', 'alula', 'al-ula'],
  'منطقة القصيم': ['بريدة', 'بريده', 'عنيزة', 'عنيزه', 'الرس', 'القصيم', 'buraydah', 'buraidah', 'unaizah', 'qassim', 'qasim'],
  'منطقة عسير': ['أبها', 'ابها', 'خميس مشيط', 'بيشة', 'عسير', 'abha', 'khamis', 'bisha', 'asir', 'aseer'],
  'منطقة تبوك': ['تبوك', 'tabuk'],
  'منطقة حائل': ['حائل', 'حايل', 'hail', "ha'il", 'hael'],
  'منطقة جازان': ['جازان', 'جيزان', 'صبيا', 'jazan', 'jizan', 'gizan'],
  'منطقة نجران': ['نجران', 'najran'],
  'منطقة الباحة': ['الباحة', 'الباحه', 'baha'],
  'منطقة الجوف': ['سكاكا', 'الجوف', 'دومة الجندل', 'sakaka', 'jouf', 'jawf'],
  'منطقة الحدود الشمالية': ['عرعر', 'رفحاء', 'طريف', 'arar', 'rafha', 'turaif'],
};

/** lower-case, unify the Arabic letters people type differently (أ إ آ → ا, ة → ه, ى → ي) */
const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

/**
 * The region of an address, or null when it can't tell. The city field wins over the free text, and the most
 * specific (longest) name wins, so "المدينة المنورة" is not read as Riyadh's "المدينة" anything.
 */
export function regionOf(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const t = norm(text);
    let best: { region: string; len: number } | null = null;
    for (const [region, names] of Object.entries(REGIONS)) {
      for (const name of names) {
        const n = norm(name);
        if (t.includes(n) && (!best || n.length > best.len)) best = { region, len: n.length };
      }
    }
    if (best) return best.region;
  }
  return null;
}
