# Arabic, English, light and dark appearance

Open **http://localhost:4174**. Language and color controls are available on the public pages, sign-in screens and app header. In **Settings → Appearance & language**, choose **Light / Dark** and **English / العربية**. In Arabic the section is **الإعدادات → المظهر واللغة**.

Both choices are saved locally on the device, restored on reload and synchronized between tabs. The initial page applies saved choices before React loads to reduce flashes of the wrong theme or direction. Arabic sets `lang=ar` and `dir=rtl`; switching to English restores LTR. Sidebar placement, navigation, forms, tables, search controls and mobile drawers use logical positioning.

Navigation, public/auth pages, dashboard, product forms/details, profile/settings, billing, scanner and owner dashboard use a local Arabic message catalog. Dates use the selected locale. Product names, notes, filenames, original OCR text and document evidence retain their original content. Switching languages while entering a product preserves its draft. No translation service, API key or paid dependency is used.

Implementation: `apps/web/src/preferences.tsx` provides shared preferences and translation; `apps/web/src/translations/ar.ts` maps English source messages to Arabic. New interface text should use `usePreferences().t(...)` and receive an Arabic entry. Missing catalog entries fall back to the English source message. Device storage failures leave controls working in memory.

Validation on 2026-10-25:

- 14 frontend tests pass, including language/direction changes, draft preservation, saved choices, cross-tab synchronization and interpolation.
- Four existing desktop/mobile browser scenarios pass with the updated appearance controls.
- Real browser validation passed Arabic/English and light/dark choices, reload persistence, RTL desktop sidebar/mobile navigation, 390px layout without page overflow, Arabic product creation and owner dashboard, and Arabic scanner review using actual local PaddleOCR on an English fixture. Extracted product values were preserved.
- Frontend production build/TypeScript and ESLint pass. Existing upstream Zod comment warnings are non-blocking.

Repeat the display browser validation with `node scripts/test-preferences-local.mjs` while the 4174 app and OCR service are running. It creates a new verification account/product and preserves existing data. Report and screenshots: `.data/display-test-result.json` and `.data/display-*.png`.
