# Implementation and validation record

Implemented in this workspace on 23 October 2026. All files were new because the repository initially contained only `.git`.

| Phase                     | Delivered                                                                                                                | Main files                                                                                       | Executed verification                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — foundation            | npm workspaces, React/Vite and Nest dependencies, normalized PostgreSQL schema, migration, seed, Compose database/mail   | `package.json`, `apps/*/package.json`, `apps/api/prisma/*`, `docker-compose.yml`, `.env.example` | Prisma generation and migration applied to real PostgreSQL; seed executed                                                                       |
| 2 — identity              | cookie authentication, refresh rotation/reuse protection, reset and verification, profile/password/account endpoints     | `apps/api/src/auth.ts`, `users.ts`, `mail.ts`, `bootstrap.ts`, `config.ts`                       | API tests for registration, invalid login, CSRF origin, email verification, single-use reset, session revocation, refresh replay, rate limiting |
| 3 — products and receipts | ownership-scoped CRUD, search/filter/sort/pagination, dates, private adapters, signatures, quotas and deletion           | `products.ts`, `storage.ts`, `warranty.ts`                                                       | real database CRUD/isolation/quota/file-access tests; seven date boundary tests                                                                 |
| 4 — reminders             | scheduled persisted jobs, unique thresholds, retries/leases, email and in-app notifications, preferences/history         | `reminders.ts`, `users.ts`, Prisma entities                                                      | repeated jobs deduplicated; simulated SMTP failure persisted and retried without duplicate in-app notification                                  |
| 5 — frontend              | all public/authenticated/system routes, forms, dashboard/chart, receipt viewer, responsive navigation, Radix dialogs     | `apps/web/src/main.tsx`, `pages/*`, `components/*`, `styles.css`                                 | three component tests; desktop/mobile browser flows and screenshots                                                                             |
| 6 — plans and PWA         | quota checks under user locks, truthful billing page, themes, preferences, install manifest/icons and static-only worker | `users.ts`, `products.ts`, `storage.ts`, `pages/account.tsx`, `vite.config.ts`, `public/*`       | concurrent limit test; storage quota test; browser dark-mode check; PWA production output generated                                             |
| 7 — delivery              | Dockerfiles, health endpoint, Swagger, environment templates, setup/security/deployment documentation                    | `apps/*/Dockerfile`, `nginx.conf`, `README.md`, `docs/*`, tests/configs                          | TypeScript, ESLint, unit/component/integration/browser checks and production builds executed                                                    |

## Latest completed checks

- TypeScript checks: API and web passed.
- ESLint: passed.
- Backend unit tests: **7 passed**.
- Frontend component tests: **3 passed**.
- PostgreSQL integration tests: **15 passed** in two suites.
- Playwright: **4 passed** across Chromium desktop and Pixel 7 viewport.
- Production API and Vite builds: passed; PWA worker and manifest generated.
- `npm audit`: **0 vulnerabilities** after upgrading mail/test dependencies and applying explicit patched dependency overrides.
- After Docker failed, the migration and seed were applied to an isolated native PostgreSQL 18 cluster and all **15 integration tests passed again**. API health returned HTTP 200.
- Docker image verification is **incomplete**: the API compiled inside the Linux build, but Docker Desktop became unresponsive during a filesystem ownership layer. That layer now changes ownership only on the data directory. Docker restart then failed on its internal `userAnalyticsOtlpHttp.sock` socket; automatic approval review blocked the attempted socket cleanup. No factory reset or Docker data deletion was performed. The native PostgreSQL fallback leaves existing Docker volumes and the pre-existing PostgreSQL service untouched.

Dependency override anchors (`@prisma/config`, Prisma, Swagger, deepmerge-ts, js-yaml) are declared at the workspace root because npm's linked workspace resolution retained vulnerable nested versions without the anchors. Keep the lockfile and run `npm ci`/audit when changing those dependencies. Prisma CLI generation still prints its package.json configuration deprecation notice; it is supported by the selected Prisma 6 release.

## Issues found and corrected

- Windows reserved/occupied database ports: mapped PostgreSQL to 15432.
- Other projects already occupied 3000 and 5173: WarrantyVault uses 3100 and 4173; unrelated processes were preserved.
- Concurrent quota tests initially hit the default Prisma transaction wait; increased bounded wait/transaction time while preserving row locking.
- New reminder jobs initially had a database timestamp later than a captured scheduler timestamp; explicitly set the first due timestamp so jobs are eligible in the same run.
- Component tests needed explicit DOM cleanup between cases.
- Screenshot review found dark-mode root colors and landing button contrast; corrected both and repeated desktop/mobile checks.
- Password validation now rejects inputs exceeding bcrypt's 72-byte limit, including multibyte characters.

## Verification boundaries

External S3 and production SMTP delivery require deployment credentials; local file storage/email adapters were exercised. Payment processing, OCR/AI, family sharing and advanced Premium analytics are intentionally unavailable, as specified. The local project has not been published to an external host. SMTP exactly-once delivery, distributed rate limiting, storage crash reconciliation, and malware scanning boundaries are documented in `DEPLOYMENT.md`.

The Docker database now uses host port 15433 and container port 5432. Local `DATABASE_URL` and its example point to 15433. The existing native PostgreSQL cluster on 15432 and its data at `%LOCALAPPDATA%/WarrantyVault/postgres` remain separate and unchanged. Run the API with `npm run start -w apps/api` and the frontend with `npm run dev -w apps/web`; the native fallback is not needed while Docker is running. File-adapter emails remain under `.data/mail`.
