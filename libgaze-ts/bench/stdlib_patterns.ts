/**
 * Node.js stdlib patterns. Tests detection of common TypeScript idioms.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";

// EXPECT: Fs
export function readJson(path: string): unknown {
  const text = readFileSync(path, "utf-8");
  return JSON.parse(text);
}

// EXPECT: Fs
export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// EXPECT: Fs
export function listDirectory(path: string): string[] {
  return readdirSync(path).filter(f => f.endsWith(".ts"));
}

// EXPECT: Fs
export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

// EXPECT: pure
export function joinPaths(base: string, name: string): string {
  return join(base, name);
}

// EXPECT: pure
export function getExtension(path: string): string {
  return extname(path);
}

// EXPECT: pure
export function getDirname(path: string): string {
  return dirname(path);
}

// EXPECT: pure
export function getBasename(path: string): string {
  return basename(path);
}

// EXPECT: Env
export function getEnvVar(key: string): string {
  return process.env[key] ?? "";
}

// EXPECT: Console
export function logMessage(msg: string): void {
  console.log(msg);
}

// EXPECT: Console
export function logError(msg: string): void {
  console.error(`[ERROR] ${msg}`);
}

// EXPECT: Time
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// EXPECT: Time
export function getTimestamp(): number {
  return Date.now();
}

// EXPECT: Rand
export function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

// EXPECT: Unsafe
export function evalCode(code: string): unknown {
  return eval(code);
}

// EXPECT: Fail
export function exitProcess(code: number): void {
  process.exit(code);
}

// EXPECT: Net
export async function fetchUrl(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

// EXPECT: pure
export function parseJson(text: string): unknown {
  return JSON.parse(text);
}

// EXPECT: pure
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
