import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const tracked = new Set(
  execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean),
);
const candidates = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    cwd: root,
  },
)
  .toString()
  .split("\0")
  .filter(Boolean);
const findings = [];

const forbiddenTrackedPaths = [
  /^\.dev\.vars(?:\.|$)/,
  /^\.env(?:\.|$)/,
  /(?:^|\/)worker-configuration\.d\.ts$/,
  /(?:^|\/)\.wrangler(?:\/|$)/,
  /(?:^|\/)dist(?:\/|$)/,
  /(?:^|\/)coverage(?:\/|$)/,
  /\.cpuprofile$/,
];

for (const file of tracked) {
  if (file === ".dev.vars.example" || file === ".env.example") continue;
  if (forbiddenTrackedPaths.some((pattern) => pattern.test(file))) {
    findings.push(`${file}: generated or local-only file is tracked`);
  }
}

const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh[opusr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["OpenAI-style token", /\bsk-[A-Za-z0-9_-]{32,}\b/],
  ["JWT-like token", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
];
const localPathPatterns = [
  /[A-Za-z]:\\Users\\[^\\\s]+/i,
  /[A-Za-z]:[\\/]My Drive[\\/]/i,
  /\/Users\/[^/\s]+/,
];
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const collectionIdPattern = /blu-ray\.com\/community\/collection\.php\?[^\s"']*\bu=(\d+)/gi;
const approvedSyntheticCollectionIds = new Set(["0", "42", "123456"]);

function readText(file) {
  const absolute = join(root, file);
  if (statSync(absolute).size > 2_000_000) return null;
  const buffer = readFileSync(absolute);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

for (const file of candidates) {
  const text = readText(file);
  if (text === null) continue;

  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) findings.push(`${file}: possible ${label}`);
  }
  if (localPathPatterns.some((pattern) => pattern.test(text))) {
    findings.push(`${file}: possible personal filesystem path`);
  }

  for (const match of text.matchAll(emailPattern)) {
    const email = match[0].toLowerCase();
    const prefix = text.slice(Math.max(0, match.index - 100), match.index);
    if (
      !/https?:\/\/[^\s"'<>]*$/i.test(prefix) &&
      !email.endsWith("@users.noreply.github.com") &&
      !email.endsWith(".invalid") &&
      !email.endsWith("@example.com")
    ) {
      findings.push(`${file}: non-approved email address`);
      break;
    }
  }

  for (const match of text.matchAll(collectionIdPattern)) {
    if (!approvedSyntheticCollectionIds.has(match[1])) {
      findings.push(`${file}: non-synthetic Blu-ray collection identifier`);
      break;
    }
  }
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const browserExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".svg"]);
for (const absolute of walk(join(root, "dist", "client"))) {
  if (!browserExtensions.has(extname(absolute))) continue;
  const text = readFileSync(absolute, "utf8");
  for (const name of ["BLURAY_COLLECTION_URL", "TMDB_READ_ACCESS_TOKEN", "SYNC_ADMIN_TOKEN"]) {
    if (text.includes(name))
      findings.push(`${relative(root, absolute)}: server-only binding in browser bundle`);
  }
  if (/blu-ray\.com\/community\/collection\.php\?[^\s"']*\bu=\d+/i.test(text)) {
    findings.push(`${relative(root, absolute)}: collection identifier in browser bundle`);
  }
}

if (findings.length > 0) {
  console.error(
    "Public-safety scan failed:\n" + findings.map((finding) => `- ${finding}`).join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(`Public-safety scan passed (${candidates.length} source files checked).`);
}
