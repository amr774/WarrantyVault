# WarrantyVault current verification

Review date: 2026-10-27 (Africa/Cairo). These are fresh results from this branch, not copied from earlier audit reports. Windows, Node 24.14.0 and npm 11.9.0 were used. PostgreSQL tests ran in a new workspace-owned cluster on 127.0.0.1:55440; MongoDB tests used a separate mental_portfolio_20261027 database. Existing user databases/configuration were not reset or reused. New local .env files and uploaded test files remain ignored.

GitHub metadata had no homepage or Pages site; the public deployments API returned [] for all four repositories. Repository source/configuration searches found no deployed URL. No public demo was published: no compatible connected persistent backend/database hosting runtime was available. Hosting examples are preparation, not proof of a working deployment. Docker CLI exists but its Linux engine is unavailable; container builds and reverse-proxy/TLS configurations were not runtime-tested. No paid resources or external messages were created.

## Changes
- Validate WEB_URL as an exact HTTP(S) origin and PORT as 1–65535, preventing silent CORS/origin mismatches from paths/trailing slashes.
- Replace the scanner outage error's internal startup instructions with a useful retry/manual-entry message.
- Added real desktop, Arabic mobile and OCR-review screenshots; refreshed README and clarified the production scanner/storage boundary.

## Executed
| Check | Result |
| --- | --- |
| npm ci; Prisma generation; all 4 migrations; reference seed | Passed on fresh database |
| Production build; typecheck; lint | Passed |
| API unit tests | 32 passed across 5 suites |
| Web tests | 14 passed across 3 files |
| API integration tests | 15 passed across 2 suites |
| Playwright desktop + Pixel 7 viewport | All 4 tests passed |
| OCR Python document/parser tests | All 18 passed |
| scripts/test-scanner-local.mjs | Passed real OCR acceptance checks described below |
| Arabic mobile/public routes | RTL verified; /, /features, /pricing, /login, /register had no 390px horizontal overflow |

Playwright exercised registration, product create/search/edit/delete, PDF upload/open, theme changes, account deletion and public/404 routes. The actual PaddleOCR run covered English PNG/JPG/PDF/WebP and Arabic PNG/PDF, review-before-save, editable fields, automatic warranty recalculation, preservation of original bytes, ownership rejection, malformed files, page/size limits and rate limiting. No mocked extraction or fabricated recognition output was used. Arabic recognition left some unreadable date/duration fields blank for human review.

The previous OCR virtualenv launcher failed because its base Anaconda Python is missing. Verification used bundled Python 3.12.14 with the existing local dependency directory on PYTHONPATH and existing model weights. That did not modify the broken environment or redownload the models. A fresh machine still needs Python dependencies and model preparation from LOCAL_OCR.md. An oversized-image test emitted the expected Pillow pixel-limit warning.

## Not verified / remaining
Cloud S3, real SMTP delivery, hosted HTTPS/cookies, reminder execution on a host that sleeps, Docker engine, physical-phone camera and every UI role. OCR saves only to local storage, while production requires S3; the OCR confirm/save flow is therefore a local-demo feature and must not be advertised as ready in the production S3 configuration. Manual uploads/product entry remain separate supported paths. See DEPLOYMENT.md.
