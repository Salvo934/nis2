/**
 * Italian VAT number (Partita IVA) check: 11 digits with a Luhn-style check
 * digit. Accepts an optional "IT" prefix and spaces; returns the 11 digits.
 */
export function normalizeItalianVat(input: string): string | null {
  const compact = input.replace(/\s+/g, "").toUpperCase().replace(/^IT/, "");
  if (!/^\d{11}$/.test(compact)) return null;

  const digits = [...compact].map(Number);
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = digits[i]!;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits[10] ? compact : null;
}
