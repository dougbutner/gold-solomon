import { UNIT } from "./constants.ts";

export function fmt(amount: bigint, digits = 6): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const whole = abs / UNIT;
  const frac = abs % UNIT;
  const fracStr = frac.toString().padStart(6, "0").slice(0, digits);
  const body = digits > 0 ? `${whole}.${fracStr}` : whole.toString();
  return `${neg ? "-" : ""}${body}`;
}

export function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

export function row(cells: string[], widths: number[]): string {
  return cells.map((c, i) => pad(c, widths[i] ?? 12)).join(" | ");
}
