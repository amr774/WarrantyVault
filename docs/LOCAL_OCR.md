# Local receipt and warranty scanner

Open **http://localhost:4173/app/scan** after signing in. The dashboard and new-product page also have a **Scan Receipt** button. Upload a document or use **Take photo**, start OCR, review the original alongside editable fields, choose a category, and click **Confirm & Save**. No scan is persisted before confirmation.

**Currently verified instance (2026-10-24): http://localhost:4174/app/scan.** This uses the separate test database, because the original Docker engine remains unavailable. Create a free account at `http://localhost:4174/register`, then use the scanner. Original-vault credentials/data are not copied into this test database.

### Try the real receipt used in verification

1. Open `http://localhost:4174/register` and create an account (password: at least 12 characters), or sign in to your existing account in this test instance.
2. Open **Scan Receipt** from the dashboard or go to `http://localhost:4174/app/scan`.
3. Choose **Upload document** and select `.data/real-receipt/sroie-000.jpg` inside the WarrantyVault project. The same scanned receipt is available as `.data/real-receipt/sroie-000.pdf` for testing PDF preview.
4. Click **Start OCR**. Wait for **Review before saving**, then expand **Recognized text**.
5. The tested JPG and PDF each returned 44 text regions. Check `KF MODELLING CLAY KIDDY FISH`, `25/12/2018 8:13:39 PM`, and `9.00` against the original. The purchase date prefills as `2018-12-25` and is highlighted for review because its label and value were separate OCR regions.
6. Other structured fields remain blank: the conservative parser does not infer unlabeled merchant/product/price columns. Text recognition has errors (for example, the store name and some footer text). Edit fields using the original document, not confidence scores alone.
7. This real receipt contains **no warranty statement**. Leave warranty duration/expiration empty; the existing product model requires a known duration before saving. Do not invent one to pass validation. To test **Confirm & Save**, use your own document with known warranty terms, or the explicitly synthetic `tests/fixtures/ocr/english.png` fixture (printed 12-month warranty), choose a category, review all fields, tick the confirmation checkbox and save.

The real scan comes from [the public SROIE sample 000.jpg](https://github.com/zzzDavid/ICDAR-2019-SROIE/blob/master/data/img/000.jpg). The PDF is a local conversion of that same scanned image, not a second receipt or generated OCR text. Sample files and machine-readable evidence are in ignored `.data/real-receipt/`; they are not application user data. The verification script never mocks OCR or injects ground-truth labels into extraction.

## Windows startup on this computer

The tested Python 3.12 environment is installed at `D:\WarrantyVault-ocr\venv` because the first installation ran out of space on C:. From the WarrantyVault project directory, run the following in separate terminals:

```powershell
# Terminal 1: local OCR, loopback only, no API keys
.\scripts\start-ocr.ps1

# Terminal 2: existing database and application
docker compose up -d db mail
npm run db:migrate
npm run dev
```

If API/web processes are already running, do not launch duplicates. API health: `http://localhost:3100/api/health`. OCR health: `http://127.0.0.1:8100/health`. PostgreSQL remains on host port **15433**, container port **5432**. Do not run a database reset or `docker compose down -v`.

## Fresh setup

Use 64-bit Python 3.12 and a drive with several GB free. On Windows, keep both the virtual environment and model directory in paths containing ASCII characters; PaddlePaddle's native file loader cannot open models under some Unicode paths.

```powershell
py -3.12 -m venv D:\WarrantyVault-ocr\venv
$env:OCR_PYTHON = 'D:\WarrantyVault-ocr\venv\Scripts\python.exe'
& $env:OCR_PYTHON -m pip install -r services/ocr/requirements-windows-lock.txt
& $env:OCR_PYTHON services/ocr/models.py
.\scripts\start-ocr.ps1 -Python $env:OCR_PYTHON
```

The Windows lock file records the exact tested dependency versions. For Linux, create a Python 3.12 venv and install `services/ocr/requirements.txt`, then run `python services/ocr/models.py` followed by `python services/ocr/service.py`. Linux installation has not been verified in this workspace.

Model setup downloads **public weights only**, before any document is submitted. Interrupted downloads can be resumed by rerunning `models.py`. Models live in `%LOCALAPPDATA%\WarrantyVault\ocr-models` on Windows or `~/.cache/WarrantyVault/ocr-models` on Linux. Set `OCR_MODEL_DIR` for a different local path in both setup and service terminals. Startup fails if models are absent; inference does not download them. No OCR API credentials are needed.

## Models and privacy

- PaddlePaddle CPU 3.2.2 + PaddleOCR 3.3.2.
- `PP-OCRv5_mobile_det` detection and `arabic_PP-OCRv5_mobile_rec` recognition.
- The [official PaddleOCR model/language table](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html) explicitly lists Arabic and English for the Arabic model. PaddleOCR/PaddlePaddle are Apache-2.0 projects; dependencies retain their own open-source licenses.
- Nest sends document bytes only to a fixed `http://127.0.0.1:8100` endpoint. Python binds to loopback, rejects browser origins/foreign hosts, disables model-host connectivity checks, uses explicit local model paths, and blocks outbound socket connections during processing. It accepts no document URLs.
- Originals stay in the existing private local receipt store. Scanner saving is refused if `STORAGE_DRIVER` is not `local`. This development integration expects Nest and Python on the same host; a containerized API cannot reach the host service through its own loopback. No public OCR port is published.
- PDF review uses local raster page previews returned by the OCR service, avoiding browser PDF-plugin/sandbox differences. Before OCR, the original PDF can be opened from its private, temporary browser URL. Previews are not persisted.
- Existing cookie authentication, origin checks and receipt ownership checks apply. Analysis has a 6-per-minute limit; only one OCR job runs at a time. Nest limits file/field sizes and waits up to 180 seconds. Python validates decoded images and PDF pages, not only extensions.
- Limits: 10 MiB, 5 PDF pages, 12 megapixels per image/rendered PDF page (PDF rendering at 144 DPI), 2,000 recognized lines. Animated images, encrypted/unreadable PDFs and malformed uploads are rejected.
- Product and receipt database rows are committed together under the existing quota lock. A failed transaction removes only its newly uploaded file. No existing rows or files are deleted by the scanner.

## Extraction rules and limitations

Extraction uses explicit English/Arabic labels, normalized Arabic digits and conservative date/money/duration rules. It leaves unlabeled/ambiguous/conflicting values empty. Receipt totals are not treated as a single product's price. This is designed for one product per review; multi-item receipts require selecting and entering the relevant product manually.

Ambiguous dates such as `01/02/2026` are left blank. Dates must be valid Gregorian dates. Warranty expiration is calculated only from a known purchase/start date plus an explicitly recognized duration, with calendar-month clamping. A printed end date is retained and any conflict is highlighted. Conflicting or unreadable explicit warranty dates must be resolved during review before saving. No duration is assumed; manual creation now also requires entering a known duration. Calculated expiration remains automatic after saving and changes when the coverage inputs are edited.

Dates may include a valid printed time. Detached date labels are matched only to a single nearby date region on the same page and row using OCR bounding boxes. Such spatial associations are always highlighted for review; the displayed recognition confidence remains the actual OCR score.

The app's existing product model requires name, category, purchase date, currency and warranty duration. If OCR misses a required value, enter it from the document before saving. Do not enter an invented duration to get past validation. All extracted text is visible for comparison. OCR confidence is a recognition score, not a guarantee of accuracy.

Arabic OCR can omit punctuation or digits. The parser handles omitted separators and reversed mixed-script labels; it does **not** reconstruct missing digits. In the synthetic Arabic image, the printed duration remained blank; in its PDF version the date and price were also missed. Manual review is required. Blurry, rotated or handwritten receipts may need a clearer, upright image. Mobile camera capture depends on the browser/device file picker; a physical phone camera has not been tested.

## Repeatable tests

```powershell
& 'D:\WarrantyVault-ocr\venv\Scripts\python.exe' -m unittest discover -s services/ocr -p 'test_*.py'
node scripts/make-ocr-fixtures.mjs
& 'D:\WarrantyVault-ocr\venv\Scripts\python.exe' -c "from PIL import Image; Image.open('tests/fixtures/ocr/english.png').save('tests/fixtures/ocr/english.webp', lossless=True)"
node scripts/test-scanner-local.mjs
npm run typecheck
npm test
npm run lint
```

Fixtures are synthetic English and Arabic receipts rendered by Chromium to real images and PDFs. Acceptance tests call actual PaddleOCR; they do not mock extraction. The local acceptance script creates new test accounts and products and leaves them in place, preserving existing data. Its report is `.data/scanner-test-result.json`; review screenshot is `.data/scanner-review.png`.

### Separate test environment used in this session

Docker Desktop failed to start with a stale telemetry socket error. The original app still targets the existing Docker database at port 15433; its `.env` was not redirected. The additive warranty-start migration had already succeeded there before Docker stopped.

A separate PostgreSQL 18 cluster was created under `D:\WarrantyVault-ocr\test-clusters\<random UUID>` for acceptance testing. It listens only on `127.0.0.1:15434`; the test API uses **3101** and test frontend **http://localhost:4174**. This database contains only test data. Process IDs and the exact cluster path are recorded in `.data/scanner-test-environment.json`.

To test this running isolated instance:

```powershell
$env:SCANNER_TEST_URL = 'http://localhost:4174'
node scripts/test-scanner-local.mjs
```

After a Windows restart, resume the same test database/API/frontend with `node scripts/resume-scanner-test.mjs`, then start the OCR service separately with `.\scripts\start-ocr.ps1`. The resume helper refuses occupied API/web ports and does not reset or recreate the database.

The resume helper runs the compiled API without automatic file watching, because a watcher restart interrupted a registration request during browser verification. Rebuild and restart this test API explicitly after backend changes.

To repeat the real-receipt browser verification while the services are running:

```powershell
$env:SCANNER_TEST_URL = 'http://localhost:4174'
node scripts/test-scanner-real-receipt.mjs
```

If the ignored sample files are absent, obtain the public sample and make its PDF copy first:

```powershell
New-Item -ItemType Directory -Force '.data/real-receipt'
Invoke-WebRequest 'https://raw.githubusercontent.com/zzzDavid/ICDAR-2019-SROIE/master/data/img/000.jpg' -OutFile '.data/real-receipt/sroie-000.jpg'
& 'D:\WarrantyVault-ocr\venv\Scripts\python.exe' -c "from PIL import Image; Image.open('.data/real-receipt/sroie-000.jpg').convert('RGB').save('.data/real-receipt/sroie-000.pdf', resolution=144.0)"
```

The sample download is a one-time public image download; subsequent OCR stays local. Its verified SHA-256 is `8b85d2c325c68579b53446177602709a8f8faeeec710912f62b6ad369234887c`.

`node scripts/start-scanner-test.mjs` can create a fresh isolated environment when those three ports are free. It refuses to reuse any existing cluster directory and never deletes data. It is a Windows-specific development helper, not a replacement for the existing Docker database. Keep any new test-app products separate from your original vault.

## Troubleshooting

- **Local OCR unavailable:** run the service and inspect its terminal output. An OCR failure saves nothing.
- **No space left on device:** create the venv on another drive; optionally set `TEMP`/`TMP` for pip to a folder there. Do not delete database files/volumes to make room.
- **Cannot open inference.json on Windows:** set `OCR_MODEL_DIR` to an ASCII local path and run model setup there.
- **Docker engine unavailable / stale userAnalyticsOtlpHttp.sock:** this is a Docker Desktop startup failure, independent of OCR. Restart Docker Desktop normally; never factory-reset or remove volumes. The API cannot use the existing Docker database until Docker is healthy.
- **Busy:** wait for the current local job to finish and retry. If a job hangs, restart only the OCR service; no database reset is needed.
