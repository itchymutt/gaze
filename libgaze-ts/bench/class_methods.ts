/**
 * Class method patterns. Tests intra-module call graph propagation.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

export class FileManager {
  constructor(private baseDir: string) {}

  // EXPECT: Fs
  read(name: string): string {
    return readFileSync(`${this.baseDir}/${name}`, "utf-8");
  }

  // EXPECT: Fs
  write(name: string, content: string): void {
    writeFileSync(`${this.baseDir}/${name}`, content);
  }

  // EXPECT: Fs
  exists(name: string): boolean {
    return existsSync(`${this.baseDir}/${name}`);
  }

  // EXPECT: Fs
  readIfExists(name: string): string | null {
    if (this.exists(name)) {
      return this.read(name);
    }
    return null;
  }

  // EXPECT: Fs
  copy(src: string, dst: string): void {
    const content = this.read(src);
    this.write(dst, content);
  }
}

export class Logger {
  // EXPECT: Console
  info(msg: string): void {
    console.log(`[INFO] ${msg}`);
  }

  // EXPECT: Console
  error(msg: string): void {
    console.error(`[ERROR] ${msg}`);
  }

  // EXPECT: Console
  logWithTimestamp(msg: string): void {
    this.info(`${new Date().toISOString()} ${msg}`);
  }
}

export class PureCalculator {
  constructor(private precision: number = 2) {}

  // EXPECT: pure
  add(a: number, b: number): number {
    return parseFloat((a + b).toFixed(this.precision));
  }

  // EXPECT: pure
  multiply(a: number, b: number): number {
    return parseFloat((a * b).toFixed(this.precision));
  }

  // EXPECT: pure
  compound(a: number, b: number, c: number): number {
    return this.add(this.multiply(a, b), c);
  }
}
