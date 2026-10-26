# WarrantyVault audit — 2026-10-25

The current user-facing local instance is **http://localhost:4174** (Nest API 3101, PostgreSQL 15434). Owner dashboard: **http://localhost:4174/app/owner**. Existing owner credentials are unchanged. Local PaddleOCR runs on `127.0.0.1:8100`.

## Fixes

- **Account switching and session exit:** signing into another account removes prior account queries while preserving the observed identity query. The first regression run exposed a stale AuthProvider after clearing the entire cache; this was fixed and retested. Logout/password-change/account-delete clear the identity and private queries. Account deletion now navigates home without racing the protected route's login redirect.
- **Scanned warranty dates:** calculated expiration is saved as a calculation, not a manual override. Editing the saved duration from 12 to 24 months now recalculates its expiration. Explicit document dates and user-entered overrides remain supported.
- **Conflicting OCR dates:** conflicting, ambiguous or unreadable explicit warranty dates cannot silently fall back to purchase date. Review must resolve the flagged dates before saving. Changing fields or rescanning requires renewed confirmation.
- **Manual product forms:** warranty duration starts empty and is required. Blank input is no longer silently converted to zero or assumed to be twelve months. Explicit zero remains valid when the user knows there is no coverage.
- **Input validation:** required database fields reject explicit null; nullable price/start/store/serial fields can still be cleared. Product/profile names are trimmed and cannot be whitespace-only. Pagination is bounded before reaching the database.
- **Reliable file deletion:** product, receipt and account deletions queue file cleanup in the same transaction as row deletion. Bytes are removed only after commit. Failed cleanup remains in the durable `PendingFileDeletion` queue for bounded five-minute retries, so transaction failures cannot leave retained receipts pointing to prematurely deleted files. Added rollback/order/retry tests.
- **Email verification:** concurrent reuse of a verification token returns a validation error instead of a database exception.
- **Owner overview:** the warranty threshold and labels now use the configured expiring-soon window instead of hardcoded 30 days.
- **Dependencies:** upgraded the Nest Multer dependency from 2.4.0 to 2.5.0 with a narrow override, addressing [GHSA-q7qp-rjg7-q26m](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m). That advisory affects asynchronous file filters; the current application uses the default filter. No broad or breaking dependency upgrade was performed. Production dependency audit reports zero vulnerabilities.

## Verification

| Check | Result |
| --- | --- |
| Backend unit/regression tests | 32 passed |
| React component/regression tests | 10 passed |
| PostgreSQL integration tests | 15 passed |
| Desktop Chromium and mobile browser scenarios | 4 passed |
| Python OCR/parser/document tests | 18 passed |
| API/web production build and TypeScript | Passed |
| ESLint | Passed |
| Owner onboarding, login, search, role injection and ownership checks | Passed |
| Actual English PNG/JPG/WebP/PDF and Arabic PNG/PDF PaddleOCR | Passed with known recognition omissions |
| Actual public SROIE receipt as JPG and image-based PDF | 44 regions each; correct purchase date |
| Scanned save → edit duration → recalculated expiration | Passed |
| Original bytes, cross-user download denial, malformed/oversize/page-limit checks | Passed |
| Existing account/product/receipt ID preservation | Passed for the current 4174 instance |

The 79 automated cases above are in addition to the standalone owner/scanner acceptance scripts. Browser receipt-upload tests now use a valid PDF fixture instead of a fabricated PDF header. Mocked component tests test form logic only; actual OCR claims come from calls to the running local PaddleOCR service.

## Isolation and repeatability

Integration and destructive browser scenarios ran against a newly created database named `warrantyvault_audit_<UUID>` on the existing test PostgreSQL server. Its own API/web used ports **3102/4175**. State is recorded in `.data/project-audit-current.json`; it is separate from the user's 4174 instance and original Docker database. Existing databases and Docker volumes were never reset. Temporary accounts/data in the audit database may be created/deleted by tests; test data in the existing instance is retained.

```powershell
node scripts/project-audit.mjs prepare  # creates a new audit database, never resets an old one
npm run build
node scripts/project-audit.mjs integration
node scripts/project-audit.mjs start
node scripts/project-audit.mjs e2e
node scripts/project-audit.mjs scanner
npm test
npm run lint
```

Run the scanner commands only while the local OCR service is running. The audit harness refuses occupied app ports. Audit data remains available for inspection; stopping its two recorded Node processes does not remove the database.

The additive `20261025010000_file_deletion_queue` migration is applied to the audit database and the current scanner/owner instance. The original Docker database is unavailable at the end of this run and was not migrated or altered. Apply `npm run db:migrate` before starting the updated API against that original database once Docker is healthy.

Evidence: `.data/owner-test-result.json`, `.data/scanner-test-result.json`, `.data/scanner-ui-test-result.json`, `.data/real-receipt/verification.json`, `.data/preserved-data-baseline.json`, and Playwright screenshots in `test-results/`.

## Remaining limits

- Docker Desktop's original engine is unavailable despite a normal start attempt; its named pipe is missing. The current 4174 app uses its separate preserved PostgreSQL database and is healthy. No factory reset or volume deletion was attempted.
- Arabic OCR can miss numerals, and unlabeled merchant/product columns require manual entry. No missing warranty information is invented. A physical mobile camera, a real Arabic receipt, remote SMTP and S3 were not tested.
- Upstream Zod pure-comment build warnings and Prisma's deprecated package configuration warning are non-blocking. The pixel-limit Python test intentionally emits a Pillow decompression warning.
- This is a functional/code review of the local development app, not a claim that every possible defect or deployment scenario has been tested.
