/* Customer name helpers: cleaning and duplicate detection.
   Plain logic with no browser code, so it can be tested on its own. */

export const digits = (s) => String(s || "").replace(/\D/g, "");

// "  Sohaib   Younas " -> "Sohaib Younas"
export const cleanName = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Same person written in different ways gets the same key: "sohaib younas"
export const nameKey = (s) => cleanName(s).toLowerCase();

// Word order does not matter: "Younas Sohaib" and "Sohaib Younas" match.
const wordKey = (s) => nameKey(s).split(" ").sort().join(" ");

/* Looks for customers that may be the same person.
   exact     = same name (ignoring spaces and capital letters). The app blocks this.
   similar   = same words in another order, or one name contains the other. The app warns.
   samePhone = same phone number. The app warns. */
export function findMatches(customers, name, phone, skipId) {
  const k = nameKey(name), w = wordKey(name), pd = digits(phone);
  const exact = [], similar = [], samePhone = [];
  if (!k) return { exact, similar, samePhone };

  for (const c of customers) {
    if (c.id === skipId) continue;
    const ck = nameKey(c.name);
    if (ck === k) exact.push(c);
    else if (wordKey(c.name) === w ||
             (k.length >= 3 && ck.includes(k)) || (ck.length >= 3 && k.includes(ck))) similar.push(c);
    if (pd.length >= 7 && digits(c.phone) === pd && ck !== k) samePhone.push(c);
  }
  return { exact, similar, samePhone };
}
