# Azure cost review

Reviewed on 2026-09-29. Figures below are configuration and utilization facts, not a billing forecast.

## Implemented in this branch

- Azure Container Apps scales `devglobe-web` to zero when idle. The app remains at 0.5 vCPU and 1 GiB because observed memory peaked at 72%, making a 0.5 GiB limit unsafe.
- The deployment re-applies `--min-replicas 0`, preventing later image deployments from restoring an always-on replica.
- A manual, confirmation-gated workflow migrates the `devglobe` Cosmos database from 4,000 RU/s manual shared throughput to autoscale with a 4,000 RU/s maximum.
- The same workflow sets `impact-history` retention to 120 days. Product views use at most 90 days, leaving a 30-day operational buffer.
- Public read routes reuse a singleton Cosmos client. Country statistics and trending results use one-hour in-process caches, and public search responses advertise a five-minute shared cache policy.

## Verified production baseline

| Resource | Current state | Finding |
| --- | --- | --- |
| Cosmos DB | 4,000 RU/s manual shared throughput | Advisor recommends autoscale. Average normalized RU consumption was 14.25%; peak reached 100%. Autoscale retains the 4,000 RU/s peak while reducing idle provisioning toward 400 RU/s. |
| Cosmos data | About 1.24 GB | `impact-history` holds about 956k documents and roughly 1.0 GB. Retention prevents unbounded growth; storage itself is not the main bill. |
| Container App | Consumption, 0.5 vCPU, 1 GiB, min 1, max 3 | Average CPU was 6.06%, average memory 29.25%, and average replicas 1.01. Scale-to-zero is appropriate for the observed low traffic, with cold-start latency as the tradeoff. |
| Container Registry | Basic | Already the lowest paid ACR tier. |
| Log Analytics | PerGB2018, 30-day retention | Retention is already conservative. Keep it unless ingestion cost becomes material. |
| Function plans | Y1 Consumption | No fixed plan charge; migrate to Flex Consumption only as a separate reliability/runtime project. |

## Applying the one-time Cosmos change

Run the **Apply Azure cost optimizations** workflow manually and enter `APPLY-COST-OPTIMIZATION` exactly. The GitHub OIDC identity must have Cosmos DB control-plane permission in subscription `5ba12f7d-8235-4c6a-857c-2dc8e4fcb50a` and resource group `rg-devglobe`.

The workflow refuses to migrate if throughput no longer matches the reviewed 4,000 RU/s manual baseline. It is safe to rerun after migration and always verifies the final autoscale maximum and container TTL.

## Follow-up after seven days

1. Compare hourly autoscale maximum billing and normalized RU consumption. If sustained peaks remain below 1,000 RU/s, evaluate a lower autoscale maximum after load testing.
2. Measure cold-start latency and error rates. Restore min replicas to 1 only if first-request latency harms real users.
3. Confirm `impact-history` expiry and document count stabilize after 120 days.
4. Review the stopped `devglobe-activity-ingest` and `devglobe-activity-timer` apps. Delete them only after confirming no storage, DNS, or deployment dependency remains.
5. Consider moving container images to an existing registry only if eliminating the Basic ACR fee outweighs migration and credential-management complexity.