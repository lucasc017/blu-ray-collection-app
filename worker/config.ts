import { validateBluRayCollectionUrl } from "./sync/bluray-client";

export class InvalidWorkerConfigurationError extends Error {
  constructor() {
    super("One or more required Worker settings are missing or invalid.");
    this.name = "InvalidWorkerConfigurationError";
  }
}

function isPlaceholder(value: string): boolean {
  return /(?:replace-with|your-(?:user-id|token|value))/i.test(value);
}

export function isUsableSecret(value: string | undefined, minimumLength: number): boolean {
  return Boolean(
    value && value === value.trim() && value.length >= minimumLength && !isPlaceholder(value),
  );
}

function validateTmdbApiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidWorkerConfigurationError();
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "api.themoviedb.org" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname.replace(/\/$/, "") !== "/3"
  ) {
    throw new InvalidWorkerConfigurationError();
  }
  return "https://api.themoviedb.org/3";
}

export interface SyncConfiguration {
  collectionUrl: string;
  tmdbApiBaseUrl: string;
  tmdbReadAccessToken: string;
}

interface SyncConfigurationInput {
  BLURAY_COLLECTION_URL: string;
  TMDB_API_BASE_URL: string;
  TMDB_READ_ACCESS_TOKEN: string;
}

export function validateSyncConfiguration(env: SyncConfigurationInput): SyncConfiguration {
  let collectionUrl: string;
  try {
    collectionUrl = validateBluRayCollectionUrl(env.BLURAY_COLLECTION_URL);
  } catch {
    throw new InvalidWorkerConfigurationError();
  }

  if (!isUsableSecret(env.TMDB_READ_ACCESS_TOKEN, 64)) {
    throw new InvalidWorkerConfigurationError();
  }

  return {
    collectionUrl,
    tmdbApiBaseUrl: validateTmdbApiBaseUrl(env.TMDB_API_BASE_URL),
    tmdbReadAccessToken: env.TMDB_READ_ACCESS_TOKEN,
  };
}
