import { readFileSync } from "node:fs";

const lockfile = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const allowed = new Set([
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT OR Apache-2.0",
  "MIT-0",
  "MPL-2.0",
]);
const issues = [];

for (const [path, pkg] of Object.entries(lockfile.packages)) {
  if (path === "") continue;
  if (!pkg.license) issues.push(`${path}: missing license metadata`);
  else if (!allowed.has(pkg.license)) issues.push(`${path}: unreviewed license ${pkg.license}`);
}

if (lockfile.packages[""].license !== "MIT") issues.push("root package must declare MIT");

if (issues.length > 0) {
  console.error(
    "Dependency license check failed:\n" + issues.map((issue) => `- ${issue}`).join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Dependency license check passed (${Object.keys(lockfile.packages).length - 1} packages).`,
  );
}
