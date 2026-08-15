import { readFileSync, writeFileSync } from "node:fs";

const projectUrl = new URL("../", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("package.json", projectUrl), "utf8"));
const lockfile = JSON.parse(readFileSync(new URL("package-lock.json", projectUrl), "utf8"));
const counts = new Map();

for (const [path, pkg] of Object.entries(lockfile.packages)) {
  if (path === "") continue;
  const license = pkg.license ?? "UNKNOWN";
  counts.set(license, (counts.get(license) ?? 0) + 1);
}

const directNames = [
  ...Object.keys(packageJson.dependencies),
  ...Object.keys(packageJson.devDependencies),
].sort();
const directRows = directNames.map((name) => {
  const pkg = lockfile.packages[`node_modules/${name}`];
  return `| \`${name}\` | ${pkg?.version ?? "unknown"} | ${pkg?.license ?? "UNKNOWN"} |`;
});
const summaryRows = [...counts.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([license, count]) => `| ${license} | ${count} |`);
const reciprocal = Object.entries(lockfile.packages)
  .filter(([, pkg]) => /(?:LGPL|MPL|CC-BY)/.test(pkg.license ?? ""))
  .map(
    ([path, pkg]) => `- \`${path.replace(/^node_modules\//, "")}@${pkg.version}\`: ${pkg.license}`,
  )
  .sort();

const report = `# Third-party dependency licenses

This file is generated from \`package-lock.json\` by \`npm run licenses:report\`. It is a review aid, not a substitute for the license text shipped with each dependency.

## License summary

| SPDX expression | Packages |
| --- | ---: |
${summaryRows.join("\n")}

## Direct dependencies

| Package | Version | License |
| --- | --- | --- |
${directRows.join("\n")}

## Dependencies requiring notice or reciprocal-license review

${reciprocal.join("\n") || "None."}

The project source is licensed under MIT. That license does not replace the separate licenses, terms, trademarks, or attribution requirements of dependencies, TMDB, Blu-ray.com, or other data providers.
`;

writeFileSync(new URL("docs/THIRD_PARTY_LICENSES.md", projectUrl), report);
console.log("Updated docs/THIRD_PARTY_LICENSES.md.");
