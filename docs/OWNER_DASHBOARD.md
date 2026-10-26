# Owner account and dashboard

The running local test instance is **http://localhost:4174**. Its owner is `amr67294@gmail.com`. The owner account was created on 2026-10-24; its private, one-use password setup link was supplied in the chat and expires after 24 hours. No email was sent externally. Choose a password of at least 12 characters, sign in with that email, and the app opens **http://localhost:4174/app/owner** automatically. The sidebar also includes **Owner dashboard**.

The dashboard shows live user/product/document counts, document storage, warranty coverage, subscription counts, category totals, and searchable paginated user records. It provides account visibility and platform statistics; it does not include user deletion, account suspension, role-editing or billing controls. Owner access does not bypass personal product/receipt ownership checks.

## Provisioning

Owner promotion is a local operator operation, never a public registration option. The additive migration gives every existing account the `USER` role. Ordinary registration also defaults to `USER`. Only the explicitly selected account is promoted; passwords and existing account data are preserved.

After applying migrations and generating Prisma, run from the project directory:

```powershell
# The isolated test instance currently running on port 4174:
node scripts/create-owner.mjs email@example.com --scanner-test

# The original database configured in apps/api/.env (when Docker is available):
node scripts/create-owner.mjs email@example.com
```

For a new email, the command creates the account and prints a one-use password setup link valid for 24 hours. The random initial password is never disclosed. For an existing email, it promotes that account without resetting its password or issuing a setup link. Keep setup links private. If a setup link expires, use **Forgot password**; development reset mail is written locally by the configured file mail driver.

For the original app, run `npm run db:migrate`, `npm run db:generate`, and `npm run build` before restarting it. Do not reset the database. The owner migration is currently applied only to the isolated database on port 15434; the original Docker database remains separate and unavailable. The test-instance owner is not automatically copied to the original database.

After restarting Windows, resume the same isolated instance with `node scripts/resume-scanner-test.mjs`. OCR remains a separate service started with `.\scripts\start-ocr.ps1`.

## Access and validation

`/api/owner/summary` and `/api/owner/users` require both a valid session and the current `OWNER` database role. Permission changes take effect on the next request; JWT/client role claims are not trusted. Member accounts receive 403 and signed-out clients 401. Responses explicitly select safe account fields and aggregate counts, omitting password hashes, reset/session tokens, receipt paths and private product details. Search is limited to 100 characters and results to 20 users per page.

Validation completed on 2026-10-24:

- API/web production builds and ESLint passed.
- 10 backend tests (including 3 permission-guard tests) and 3 frontend tests passed.
- `node scripts/test-owner-local.mjs` passed actual browser onboarding through one-use password setup, login redirect, desktop/mobile dashboard, live statistics, search/empty state, role injection rejection, member access denial, immediate permission revocation and private product/receipt access denial.
- Browser screenshots are `.data/owner-dashboard.png` and `.data/owner-dashboard-mobile.png`; the report is `.data/owner-test-result.json`.
- Test-created accounts and a private test product were retained. The test owner was demoted to an ordinary member after verification. No existing data was deleted.
