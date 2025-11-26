// Quick analysis script to find legacy modern.css rules
// that may visually override the new layout via !important.
//
// Usage:
//   # 从仓库根目录
//   node scripts/check-modern-overrides.js
//   # 或在 frontend/ 目录
//   node ../scripts/check-modern-overrides.js

/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");

// 兼容从根目录或 frontend/ 目录执行
const cwd = process.cwd();
const isFrontendCwd = cwd.endsWith(`${path.sep}frontend`);
const repoRoot = isFrontendCwd ? path.resolve(cwd, "..") : cwd;

const modernCssPath = path.resolve(
  repoRoot,
  "frontend",
  "src",
  "styles",
  "modern.css"
);

const content = fs.readFileSync(modernCssPath, "utf8");
const lines = content.split(/\r?\n/);

const importantProps = new Set([
  "background",
  "background-color",
  "color",
  "border",
  "border-color",
  "box-shadow"
]);

const results = [];

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  if (!line.includes("!important")) continue;

  // Walk backwards to find the selector block for this declaration
  let j = i;
  const selectorLines = [];
  while (j >= 0 && !lines[j].includes("{")) {
    selectorLines.unshift(lines[j].trim());
    j -= 1;
  }
  if (j < 0) continue;

  const beforeBrace = lines[j].split("{")[0].trim();
  selectorLines.unshift(beforeBrace);
  const selector = selectorLines.join(" ").replace(/\s+/g, " ").trim();
  const lowerSelector = selector.toLowerCase();

  // 只关心 legacy 暗黑容器作用域下的规则
  const touchesLegacyScope =
    lowerSelector.includes(".dq-theme") ||
    lowerSelector.includes(":where(.dark .dq-theme");
  if (!touchesLegacyScope) continue;

  const propMatch = line.match(/^\s*([a-zA-Z-]+)\s*:/);
  const prop = propMatch ? propMatch[1] : "unknown";
  const isVisualProp = importantProps.has(prop);

  results.push({
    line: i + 1,
    selector,
    prop,
    isVisualProp,
    text: line.trim()
  });
}

results.sort((a, b) => a.line - b.line);

const flagged = results.filter(r => r.isVisualProp);
const unflagged = results.filter(r => !r.isVisualProp);

const summarize = (arr, label) => {
  if (!arr.length) return;
  console.log(`\n${label} (${arr.length} rules):\n`);
  for (const r of arr) {
    console.log(
      `[L${String(r.line).padStart(4, " ")}] ${r.prop}${
        r.isVisualProp ? " *" : ""
      }\n  selector: ${r.selector}\n  decl:     ${r.text}\n`
    );
  }
};

console.log(
  `Scanning ${modernCssPath} for "!important" rules under .dq-theme scope...`
);
console.log(`Total matches: ${results.length}\n`);

summarize(flagged, "Potentially dangerous visual overrides");
summarize(unflagged, "Other !important rules in legacy scope");
