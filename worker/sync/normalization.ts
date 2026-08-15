import type { ParsedRelease } from "./types";

const formatPattern = /\s+(?:4K(?:\s+Ultra\s+HD)?|Ultra\s+HD|Blu-ray(?:\s+3D)?)(?=\s*$)/i;

export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function sortTitle(value: string): string {
  return normalizeTitle(value).replace(/^(?:the|an|a)\s+/, "");
}

export function parseReleaseLabel(
  productId: string,
  sourceTitle: string,
  sourceUrl: string,
): ParsedRelease {
  const yearMatch = sourceTitle.match(/\((\d{4})(?:\s*[-–]\s*\d{4})?\)\s*$/);
  const releaseYear = yearMatch ? Number(yearMatch[1]) : null;
  const withoutYear = yearMatch ? sourceTitle.slice(0, yearMatch.index).trim() : sourceTitle.trim();
  const cleanTitle = withoutYear.replace(formatPattern, "").trim();
  const format = /\b4K\b|Ultra\s+HD/i.test(withoutYear)
    ? "4K UHD"
    : /\b3D\b/i.test(withoutYear)
      ? "Blu-ray 3D"
      : "Blu-ray";
  const normalizedTitle = normalizeTitle(cleanTitle);

  return {
    productId,
    sourceTitle,
    normalizedTitle,
    releaseYear,
    sourceUrl,
    format,
    fingerprint: [sourceTitle, sourceUrl, format].join("|"),
  };
}
