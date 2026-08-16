import type { SyncBatchResult } from "../../shared/contracts";
import { validateSyncConfiguration } from "../config";
import { logEvent } from "../logging";
import { fetchRecentlyAddedCollection } from "./bluray-client";
import { ExternalFetchError, FetchBudget, FetchBudgetExceededError } from "./fetch-budget";
import { releaseOverrides } from "./overrides";
import { SyncRepository } from "./repository";
import { getEasternSlot, randomDailySlot } from "./schedule";
import { TmdbClient } from "./tmdb-client";
import type { ParsedRelease, SyncRunRow, TitleMetadata } from "./types";

export interface RunSyncOptions {
  triggerType: "scheduled" | "manual";
  force: boolean;
  now: Date;
  discoverySnapshot?: ParsedRelease[];
  stopAfterDiscovery?: boolean;
}

const emptyCounts = {
  externalFetches: 0,
  releasesSeen: 0,
  releasesResolved: 0,
  issuesCreated: 0,
  titlesRefreshed: 0,
};

function resultFromRun(run: SyncRunRow | null, status: SyncBatchResult["status"]): SyncBatchResult {
  if (!run) return { runId: null, status, phase: null, cursor: null, counts: emptyCounts };
  return {
    runId: run.id,
    status,
    phase: run.phase,
    cursor: run.cursor,
    counts: {
      externalFetches: run.external_fetches,
      releasesSeen: run.releases_seen,
      releasesResolved: run.releases_resolved,
      issuesCreated: run.issues_created,
      titlesRefreshed: run.titles_refreshed,
    },
  };
}

function safePositiveInteger(value: string, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function runSyncBatch(env: Env, options: RunSyncOptions): Promise<SyncBatchResult> {
  const configuration = validateSyncConfiguration(env);
  const repository = new SyncRepository(env.DB);
  const eastern = getEasternSlot(options.now);
  let run = await repository.getActiveRun();
  let localDate = run?.local_date ?? eastern.localDate;

  if (run && options.discoverySnapshot && run.phase !== "discover") {
    return resultFromRun(run, "busy");
  }

  if (!run) {
    await repository.ensureDay(localDate, randomDailySlot(), options.now);
    const day = await repository.getDay(localDate);
    if (!day) throw new Error("The daily sync schedule could not be initialized.");
    if (day.status === "complete") {
      return resultFromRun(day.run_id ? await repository.getRun(day.run_id) : null, "complete");
    }
    if (!options.force && eastern.slot < day.target_slot) return resultFromRun(null, "not-due");
  }

  const leaseToken = crypto.randomUUID();
  if (!(await repository.acquireLease(localDate, leaseToken, options.now))) {
    return resultFromRun(run, "busy");
  }

  if (!run) {
    run = await repository.createRun(
      crypto.randomUUID(),
      localDate,
      options.triggerType,
      options.now,
    );
  } else {
    localDate = run.local_date;
  }

  const budget = new FetchBudget(safePositiveInteger(env.SYNC_MAX_EXTERNAL_FETCHES, 40, 40));
  const tmdb = new TmdbClient(
    configuration.tmdbApiBaseUrl,
    configuration.tmdbReadAccessToken,
    budget,
  );

  logEvent("info", "sync.batch_started", {
    runId: run.id,
    phase: run.phase,
    trigger: options.triggerType,
    localDate,
  });

  try {
    while (true) {
      if (run.phase === "discover") {
        if (options.discoverySnapshot) {
          await repository.saveDiscovery(run.id, options.discoverySnapshot, options.now);
        } else {
          const releases = await fetchRecentlyAddedCollection(
            configuration.collectionUrl,
            env.BROWSER,
            budget,
            (productIds) => repository.findExistingProductIds(productIds),
          );
          await repository.saveIncrementalDiscovery(run.id, releases, options.now);
        }
        run = (await repository.getRun(run.id)) ?? run;
        if (options.stopAfterDiscovery) {
          await repository.releaseLease(localDate, leaseToken, options.now);
          return resultFromRun(run, "running");
        }
        continue;
      }

      if (run.phase === "resolve") {
        const release = await repository.nextPendingRelease(run.cursor);
        if (!release) {
          await repository.moveToPhase(run.id, "refresh", options.now);
          run = (await repository.getRun(run.id)) ?? run;
          continue;
        }

        const override = releaseOverrides[release.product_id];
        let metadata: TitleMetadata[] | null = null;
        if (override) {
          metadata = [];
          for (const target of override) metadata.push(await tmdb.fetchMetadata(target));
        } else {
          const resolution = await tmdb.resolveMovie(release);
          if (!resolution.ok) {
            await repository.recordIssue(run.id, release, resolution.issue, options.now);
            run = (await repository.getRun(run.id)) ?? run;
            continue;
          }
          metadata = resolution.metadata;
        }
        await repository.resolveRelease(run.id, release, metadata, options.now);
        run = (await repository.getRun(run.id)) ?? run;
        continue;
      }

      if (run.phase === "refresh") {
        const ttlDays = safePositiveInteger(env.TMDB_METADATA_TTL_DAYS, 30, 365);
        const cutoff = new Date(options.now.getTime() - ttlDays * 86_400_000);
        const stale = await repository.nextStaleTitle(run.cursor, cutoff);
        if (!stale) {
          await repository.moveToPhase(run.id, "finalize", options.now);
          run = (await repository.getRun(run.id)) ?? run;
          continue;
        }
        await repository.upsertTitle(await tmdb.fetchMetadata(stale));
        await repository.recordRefresh(run.id, stale.id, options.now);
        run = (await repository.getRun(run.id)) ?? run;
        continue;
      }

      await repository.addExternalFetches(run.id, budget.used, null, options.now);
      await repository.completeRun(run.id, localDate, leaseToken, options.now);
      const completed = await repository.getRun(run.id);
      logEvent("info", "sync.run_completed", {
        runId: run.id,
        localDate,
        externalFetches: completed?.external_fetches ?? budget.used,
      });
      return resultFromRun(completed, "complete");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown synchronization failure.";
    const retryable =
      error instanceof FetchBudgetExceededError ||
      (error instanceof ExternalFetchError && error.retryable);

    await repository.addExternalFetches(run.id, budget.used, message, options.now);
    if (retryable) {
      await repository.releaseLease(localDate, leaseToken, options.now);
      const current = await repository.getRun(run.id);
      logEvent("warn", "sync.batch_deferred", {
        runId: run.id,
        phase: current?.phase ?? run.phase,
        reason: message,
        externalFetches: budget.used,
      });
      return resultFromRun(current, "running");
    }

    await repository.failRun(run.id, localDate, leaseToken, message, options.now);
    const failed = await repository.getRun(run.id);
    logEvent("error", "sync.run_failed", { runId: run.id, phase: run.phase, error: message });
    return resultFromRun(failed, "failed");
  }
}
