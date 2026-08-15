# ADR 0002: D1-backed resumable synchronization

Status: accepted, 2026-08-15.

Use a 15-minute Cron trigger with D1 daily state, leases, phases, and cursors. Each invocation is capped at 40 external requests and can resume incomplete work. This allows a free-tier-first launch and protects prior collection data on partial failure without adding Queues or Workflows to V1.
