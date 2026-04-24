/**
 * Pure functions only. Every function should be detected as pure.
 */

interface Point {
  x: number;
  y: number;
}

// EXPECT: pure
export function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// EXPECT: pure
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// EXPECT: pure
export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

// EXPECT: pure
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// EXPECT: pure
export function flatten<T>(nested: (T | T[])[]): T[] {
  const result: T[] = [];
  for (const item of nested) {
    if (Array.isArray(item)) {
      result.push(...flatten(item as (T | T[])[]));
    } else {
      result.push(item);
    }
  }
  return result;
}

// EXPECT: pure
export function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = String(item[key]);
    (groups[k] ??= []).push(item);
  }
  return groups;
}

// EXPECT: pure
export function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (typeof result[key] === "object" && typeof value === "object" && result[key] !== null && value !== null) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// EXPECT: pure
export function validateEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

// EXPECT: pure
export function truncate(text: string, maxLen = 100, suffix = "..."): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - suffix.length) + suffix;
}

// EXPECT: pure
export function fibonacci(n: number): number {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

// EXPECT: pure
export function jsonRoundtrip(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data));
}
