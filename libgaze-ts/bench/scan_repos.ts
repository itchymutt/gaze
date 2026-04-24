/**
 * Large-scale scan of real TypeScript agent framework code.
 *
 * Scans MCP Servers, Vercel AI SDK, and OpenAI Agents JS.
 *
 * Usage:
 *   npx tsc && node dist/bench/scan_repos.js
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzeFilePath } from "../src/analyzer.js";
import { Effect } from "../src/effects.js";

interface RepoStats {
  name: string;
  filesScanned: number;
  filesFailed: number;
  totalFunctions: number;
  pureFunctions: number;
  effectfulFunctions: number;
  effectCounts: Map<string, number>;
  effectCombos: Map<string, number>;
  findings: string[];
}

function newStats(name: string): RepoStats {
  return {
    name,
    filesScanned: 0,
    filesFailed: 0,
    totalFunctions: 0,
    pureFunctions: 0,
    effectfulFunctions: 0,
    effectCounts: new Map(),
    effectCombos: new Map(),
    findings: [],
  };
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "build", ".next", "__tests__", "test", "tests"]);

  function walk(d: string) {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
        const full = join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".d.ts") &&
          !entry.name.endsWith(".test.ts") &&
          !entry.name.endsWith(".spec.ts") &&
          !entry.name.includes("test")
        ) {
          results.push(full);
        }
      }
    } catch {
      // permission errors, etc.
    }
  }

  walk(dir);
  return results.sort();
}

function scanDirectory(name: string, path: string): RepoStats {
  const stats = newStats(name);
  const files = collectTsFiles(path);

  for (const f of files) {
    try {
      const result = analyzeFilePath(f);
      stats.filesScanned++;

      for (const fn of result.functions) {
        stats.totalFunctions++;
        if (fn.pure) {
          stats.pureFunctions++;
        } else {
          stats.effectfulFunctions++;
          for (const effect of fn.effects) {
            stats.effectCounts.set(String(effect), (stats.effectCounts.get(String(effect)) ?? 0) + 1);
          }
          const combo = [...fn.effects].sort().join(", ");
          stats.effectCombos.set(combo, (stats.effectCombos.get(combo) ?? 0) + 1);

          // Flag interesting findings
          if (fn.effects.has(Effect.Unsafe) && fn.effects.size > 1) {
            const rel = f.replace(path + "/", "");
            stats.findings.push(`  ${rel}:${fn.name}:${fn.line}  can ${combo}`);
          }
        }
      }
    } catch {
      stats.filesFailed++;
    }
  }

  return stats;
}

function printStats(stats: RepoStats): void {
  const purity = stats.totalFunctions > 0
    ? Math.round(stats.pureFunctions / stats.totalFunctions * 100)
    : 0;

  console.log(`  ${stats.name}`);
  console.log(`    ${stats.filesScanned} files scanned (${stats.filesFailed} failed to parse)`);
  console.log(`    ${stats.totalFunctions} functions (${stats.pureFunctions} pure, ${stats.effectfulFunctions} effectful, ${purity}% purity)`);
  console.log();

  if (stats.effectCounts.size > 0) {
    console.log(`    Effects detected:`);
    const sorted = [...stats.effectCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [effect, count] of sorted) {
      console.log(`      ${effect.padEnd(10)}  ${count}`);
    }
    console.log();
  }

  if (stats.effectCombos.size > 0) {
    console.log(`    Most common effect combinations:`);
    const sorted = [...stats.effectCombos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [combo, count] of sorted) {
      console.log(`      ${combo.padEnd(30)}  ${count}`);
    }
    console.log();
  }

  if (stats.findings.length > 0) {
    console.log(`    Unsafe + other effects (${stats.findings.length} functions):`);
    for (const f of stats.findings.slice(0, 15)) {
      console.log(`    ${f}`);
    }
    if (stats.findings.length > 15) {
      console.log(`    ... and ${stats.findings.length - 15} more`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------

const REPOS: [string, string][] = [
  ["MCP Servers", "/tmp/gaze-scan/mcp-servers/src"],
  ["Vercel AI SDK", "/tmp/gaze-scan/vercel-ai/packages"],
  ["OpenAI Agents JS", "/tmp/gaze-scan/openai-agents/packages"],
];

console.log();
console.log("  libgaze-ts large-scale scan");
console.log("  " + "=".repeat(50));
console.log();

const allStats: RepoStats[] = [];

for (const [name, path] of REPOS) {
  try {
    statSync(path);
  } catch {
    console.log(`  SKIP  ${name} (not found at ${path})`);
    console.log();
    continue;
  }

  const stats = scanDirectory(name, path);
  allStats.push(stats);
  printStats(stats);
}

if (allStats.length > 0) {
  const totalFiles = allStats.reduce((s, r) => s + r.filesScanned, 0);
  const totalFns = allStats.reduce((s, r) => s + r.totalFunctions, 0);
  const totalPure = allStats.reduce((s, r) => s + r.pureFunctions, 0);
  const totalEffectful = allStats.reduce((s, r) => s + r.effectfulFunctions, 0);
  const totalFindings = allStats.reduce((s, r) => s + r.findings.length, 0);
  const purity = totalFns > 0 ? Math.round(totalPure / totalFns * 100) : 0;

  const aggEffects = new Map<string, number>();
  for (const s of allStats) {
    for (const [effect, count] of s.effectCounts) {
      aggEffects.set(effect, (aggEffects.get(effect) ?? 0) + count);
    }
  }

  console.log("  " + "=".repeat(50));
  console.log(`  TOTAL`);
  console.log(`    ${totalFiles} files, ${totalFns} functions`);
  console.log(`    ${totalPure} pure, ${totalEffectful} effectful (${purity}% purity)`);
  console.log(`    ${totalFindings} functions with Unsafe + other effects`);
  console.log();
  console.log(`    Aggregate effect frequency:`);
  const sorted = [...aggEffects.entries()].sort((a, b) => b[1] - a[1]);
  for (const [effect, count] of sorted) {
    const pct = totalEffectful > 0 ? Math.round(count / totalEffectful * 100) : 0;
    console.log(`      ${effect.padEnd(10)}  ${String(count).padStart(5)}  (${pct}% of effectful)`);
  }
  console.log();
}
