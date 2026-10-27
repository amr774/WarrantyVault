# Deployment guide

## Prepare infrastructure

1. Provision PostgreSQL 17 (or compatible maintained PostgreSQL), a private S3-compatible bucket, and an SMTP account. Use separate credentials and databases for staging and production.
2. Create a least-privilege bucket policy: the API needs object put/get/delete, not public-read ACLs. Block public access. Enable encryption at rest. S3 requests set AES256 encryption; confirm your compatible provider supports it.
3. Create a stable HTTPS origin such as `https://vault.example.com`. Serve the frontend and proxy `/api/` to Nest on that same origin. TLS termination and certificate renewal belong to your reverse proxy/platform.
4. Keep the API running continuously so the reminder scheduler runs even with no visitors. Start with one API instance; rate limits are process-local. For multiple public replicas, add shared rate-limit storage at the edge before scaling.

## Configure secrets

Use `.env.example` as the variable reference. Inject variables through your hosting secret manager rather than copying `.env` into an image.

- `NODE_ENV=production`
- `DATABASE_URL`: production PostgreSQL connection string, with provider-required TLS
- `JWT_SECRET`: cryptographically random, at least 32 characters
- `WEB_URL`: exact HTTPS browser origin (no trailing slash)
- `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`; optional endpoint for compatible storage
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`, or the AWS default credential chain/workload role
- `MAIL_DRIVER=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional authentication
- `MAX_UPLOAD_BYTES` and `EXPIRING_SOON_DAYS` as appropriate

Production startup rejects local storage, file mail, non-HTTPS web origins, and the example secret. Confirm SMTP certificate validation remains enabled. Configure SPF/DKIM/DMARC for the sender domain.

## Build and migrate

```sh
npm ci
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

From `apps/api`, with production variables securely injected:

```sh
npx prisma migrate deploy
npx tsx prisma/seed.ts
node dist/main.js
```

Run migrations once as a release job before starting the new API. Never use `migrate dev` or `db push` against production. Seeds are idempotent and do not overwrite existing plan settings. Serve `apps/web/dist` through your static host/reverse proxy with SPA fallback. Do not cache `/api/*`. The included Nginx configuration illustrates routing and upload size limits.

Dockerfiles build the same artifacts. The API image runs as the non-root `node` user. Configure environment variables and invoke migrations separately with your deployment platform. The development Compose `api` service intentionally does not auto-migrate on every startup.

## Verify and operate

- `/api/health` checks database connectivity; use it for readiness/liveness.
- Register, verify email, log in, create a product, upload/download/delete a receipt, and run a reminder using staging accounts.
- Validate bucket denial for anonymous access and actual production SMTP delivery. These require your provider credentials and are separate from local-adapter tests.
- Set reverse-proxy timeouts and request size limits. Avoid logging cookies, passwords, signed query strings, receipt bytes, or token fragments.
- Configure monitoring for failed delivery rows (`attempts >= 8`), HTTP errors, storage failures, and database capacity.
- Back up PostgreSQL and the bucket, and rehearse restoration. Coordinate retention and permanent account deletion with backup policies.
- Keep Nginx, Node, PostgreSQL, dependencies, and lockfile updated. Re-run audit and tests before release.

## Known operational boundaries

SMTP cannot guarantee exactly-once delivery. A provider idempotency API is needed for that guarantee. Object storage and SQL cannot form one atomic transaction; file deletion is attempted before metadata removal so failures are visible/retryable, and failed-upload cleanup is attempted. A crash during an upload can leave an unreferenced private object; periodically reconcile bucket keys with Receipt rows before applying orphan retention rules.

The MVP validates allowed file signatures and serves them privately with restrictive headers. It does not include malware scanning. Add a quarantine/scanning pipeline before accepting uploads in a higher-risk public deployment. Do not serve uploaded files as executable HTML or through a public bucket.

Swagger is exposed only outside production. Source maps and development tools should not be publicly hosted. Payment processing and family sharing are not implemented. Local PaddleOCR analysis/review is implemented and was tested on 2026-10-27; saving scans requires STORAGE_DRIVER=local. Because production startup requires S3, the scan-confirm workflow is not production-compatible. Use manual product entry/receipt uploads in production until a separately reviewed storage integration is implemented.

## Portfolio deployment status (2026-10-27)

No homepage, Pages site or GitHub deployment record was found. No compatible connected persistent Node/PostgreSQL/S3/SMTP host was available. To publish, supply hosting access, a dedicated PostgreSQL database, a private S3-compatible bucket and SMTP credentials via the hosting secret manager. A public domain/TLS and a continuously running API are required for cookies and reminders. No costs were authorized or incurred.

For a local scanning demonstration, run Python 3.12 with services/ocr/requirements.txt, prepare the public OCR model weights with services/ocr/models.py, then run services/ocr/service.py on loopback port 8100. Keep Nest and OCR on the same host; the OCR server intentionally rejects remote clients. The Docker app profile does not include OCR. Never publish port 8100. No documents are sent to an external OCR provider.
