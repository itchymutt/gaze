/**
 * Benchmark runner for libgaze-ts.
 *
 * Reads all .ts files in bench/, parses // EXPECT: comments,
 * runs the analyzer, and compares per-function.
 *
 * Usage:
 *   npx tsc && node dist/bench/run.js
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSource } from "../src/analyzer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// When compiled, __dirname is dist/bench. Source files are in bench/.
const benchDir = join(__dirname, "..", "..", "bench");

interface Expected {
  functionName: string;
  effects: Set<string>; // set of effect names, or empty for pure
  file: string;
  line: number;
}

interface Result {
  tp: number;
  fp: number;
  fn: number;
  details: string[];
}

function parseExpectations(path: string): Expected[] {
  const lines = readFileSync(path, "utf-8").split("\n");
  const expectations: Expected[] = [];
  let pendingExpect: Set<string> | null = null;
  let pendingLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    const lineNo = i + 1;

    // Look for // EXPECT: comments
    const match = stripped.match(/^\/\/\s*EXPECT:\s*(.+)$/);
    if (match) {
      const raw = match[1].trim();
      if (raw.toLowerCase() === "pure") {
        pendingExpect = new Set();
      } else {
        pendingExpect = new Set(raw.split(",").map(s => s.trim()));
      }
      pendingLine = lineNo;
      continue;
    }

    // Look for function/method/arrow declarations after EXPECT
    const fnMatch = stripped.match(
      /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*\(.*\)\s*[:{]|(?:const|let|var)\s+(\w+)\s*=)/
    );
    if (fnMatch && pendingExpect !== null) {
      const name = fnMatch[1] ?? fnMatch[2] ?? fnMatch[3];
      if (name) {
        expectations.push({
          functionName: name,
          effects: pendingExpect,
          file: path,
          line: pendingLine,
        });
      }
      pendingExpect = null;
      continue;
    }

    // Reset on non-comment, non-blank, non-decorator lines
    if (stripped && !stripped.startsWith("//") && !stripped.startsWith("@") && !fnMatch) {
      pendingExpect = null;
    }
  }

  return expectations;
}

function runBenchmark(verbose: boolean): Result {
  const result: Result = { tp: 0, fp: 0, fn: 0, details: [] };

  const files = readdirSync(benchDir)
    .filter(f => f.endsWith(".ts") && f !== "run.ts")
    .sort()
    .map(f => join(benchDir, f));

  if (files.length === 0) {
    console.log("No benchmark files found.");
    return result;
  }

  let totalFunctions = 0;

  for (const path of files) {
    const expectations = parseExpectations(path);
    if (expectations.length === 0) continue;

    const source = readFileSync(path, "utf-8");
    const analysis = analyzeSource(source, path);
    const fnByName = new Map(analysis.functions.map(fn => [fn.name, fn]));

    let fileTp = 0, fileFp = 0, fileFn = 0;
    const fileName = path.split("/").pop()!;

    for (const exp of expectations) {
      totalFunctions++;
      const actual = fnByName.get(exp.functionName);

      if (!actual) {
        result.details.push(`  MISSING  ${fileName}:${exp.functionName}`);
        result.fn += exp.effects.size || 1;
        fileFn += exp.effects.size || 1;
        continue;
      }

      const actualEffects = new Set([...actual.effects].map(String));
      const expectedEffects = exp.effects;

      if (expectedEffects.size === 0) {
        // Expected pure
        if (actualEffects.size > 0) {
          for (const e of [...actualEffects].sort()) {
            result.fp++;
            fileFp++;
            result.details.push(
              `  FP  ${fileName}:${exp.functionName}  reported ${e} but expected pure`
            );
          }
        } else {
          result.tp++;
          fileTp++;
        }
      } else {
        // Expected specific effects
        for (const e of expectedEffects) {
          if (actualEffects.has(e)) {
            result.tp++;
            fileTp++;
          } else {
            result.fn++;
            fileFn++;
            result.details.push(
              `  FN  ${fileName}:${exp.functionName}  missed ${e}`
            );
          }
        }
        for (const e of actualEffects) {
          if (!expectedEffects.has(e)) {
            result.fp++;
            fileFp++;
            result.details.push(
              `  FP  ${fileName}:${exp.functionName}  reported ${e} but not expected`
            );
          }
        }
      }
    }

    const status = fileFp === 0 && fileFn === 0 ? "PASS" : "FAIL";
    if (verbose || fileFp > 0 || fileFn > 0) {
      console.log(`  ${status}  ${fileName}  (${expectations.length} functions, ${fileTp} TP, ${fileFp} FP, ${fileFn} FN)`);
    } else {
      console.log(`  ${status}  ${fileName}  (${expectations.length} functions)`);
    }
  }

  const precision = result.tp + result.fp > 0 ? result.tp / (result.tp + result.fp) : 1;
  const recall = result.tp + result.fn > 0 ? result.tp / (result.tp + result.fn) : 1;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  console.log();
  console.log(`  ${totalFunctions} functions across ${files.length} files`);
  console.log(`  ${result.tp} true positives, ${result.fp} false positives, ${result.fn} false negatives`);
  console.log();
  console.log(`  precision  ${(precision * 100).toFixed(1)}%`);
  console.log(`  recall     ${(recall * 100).toFixed(1)}%`);
  console.log(`  F1         ${(f1 * 100).toFixed(1)}%`);

  if (verbose && result.details.length > 0) {
    console.log();
    console.log("  Details:");
    for (const d of result.details) {
      console.log(`    ${d}`);
    }
  }

  return result;
}

// Main
console.log();
console.log("  libgaze-ts benchmark");
console.log("  " + "=".repeat(40));
console.log();

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
const result = runBenchmark(verbose);

console.log();

if (result.tp + result.fp > 0 && result.tp / (result.tp + result.fp) < 0.95) {
  console.log(`  FAIL: precision below 95%`);
  process.exit(1);
}
if (result.tp + result.fn > 0 && result.tp / (result.tp + result.fn) < 0.80) {
  console.log(`  FAIL: recall below 80%`);
  process.exit(1);
}

console.log("  PASS");
