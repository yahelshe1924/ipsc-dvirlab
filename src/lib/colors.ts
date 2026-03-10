/**
 * lib/colors.ts
 * -------------
 * Stable, accessible colour palette for lab members.
 * colour_index is stored in the DB and never changes for a member.
 */

export const PERSON_COLORS: { bg: string; text: string; light: string }[] = [
  { bg: "#0e7490", text: "#fff", light: "#cffafe" }, // teal
  { bg: "#7c3aed", text: "#fff", light: "#ede9fe" }, // violet
  { bg: "#b45309", text: "#fff", light: "#fef3c7" }, // amber
  { bg: "#059669", text: "#fff", light: "#d1fae5" }, // emerald
  { bg: "#dc2626", text: "#fff", light: "#fee2e2" }, // red
  { bg: "#2563eb", text: "#fff", light: "#dbeafe" }, // blue
  { bg: "#db2777", text: "#fff", light: "#fce7f3" }, // pink
  { bg: "#65a30d", text: "#fff", light: "#ecfccb" }, // lime
];

export function getColor(colorIndex: number) {
  return PERSON_COLORS[colorIndex % PERSON_COLORS.length];
}
