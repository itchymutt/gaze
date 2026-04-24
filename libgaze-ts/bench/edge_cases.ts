/**
 * Edge cases and tricky patterns.
 */

// EXPECT: pure
export function stringOps(text: string): string {
  return text.trim().toLowerCase().replace(/-/g, "_");
}

// EXPECT: pure
export function listComprehension(items: number[]): number[] {
  return items.filter(x => x > 0).map(x => x * 2);
}

// EXPECT: pure
export function dictMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  return { ...a, ...b };
}

// EXPECT: Time
export function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// EXPECT: Rand
export function generateId(): string {
  return `id-${Math.random().toString(36).slice(2)}`;
}

// EXPECT: Console, Env
export function debugEnv(key: string): void {
  const value = process.env[key] ?? "(not set)";
  console.log(`${key}=${value}`);
}

// EXPECT: pure
export function dynamicDispatch(obj: Record<string, () => unknown>, method: string): unknown {
  return obj[method]();
}

// EXPECT: pure
export function callback(items: number[], fn: (x: number) => number): number[] {
  return items.map(fn);
}

// EXPECT: pure
export function tryCatch(): string {
  try {
    return String(1 / 1);
  } catch {
    return "error";
  }
}

// EXPECT: Fs
export function conditionalWrite(shouldWrite: boolean, path: string): void {
  if (shouldWrite) {
    const { writeFileSync } = require("node:fs");
    writeFileSync(path, "data");
  }
}

// EXPECT: Unsafe
export function dynamicFunction(code: string): unknown {
  return new Function("return " + code)();
}

// EXPECT: Net, Time
export async function fetchWithTimeout(url: string, ms: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

// EXPECT: pure
export function typeAnnotationOnly(path: import("node:fs").PathLike): string {
  return String(path);
}
