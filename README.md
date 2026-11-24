# SNC Customer Ledger PWA

Offline-first wholesale mandi customer ledger with Marathi/English statements, tap-to-inspect **Vegetable-Wise Bill Details**, automatic Sheet1/Sheet2 **Reconciliation Audit**, **Google Sheets + Google Drive Apps Script** backend, and free **GitHub Pages** hosting.

## 1. Set Up Google Sheets + Google Drive Backend (`apps-script/Code.gs`)

1. Create a Google Sheet named **SNC_Ledger_DB** and copy its ID from the URL (`/spreadsheets/d/<DB_ID>/edit`).
2. Open [script.google.com](https://script.google.com), create a new project, and paste the contents of `apps-script/Code.gs`.
3. In **Project Settings → Script properties**, add:
   - `DB_ID`: your Google Sheet ID
   - `UPLOAD_PIN`: private operator PIN (rate-limited after 5 failed attempts)
   - `DRIVE_FOLDER_ID` *(optional)*: Google Drive folder ID for backups (if omitted, `setupLedger` automatically creates `SNC_Ledger_Backups`)
   - `READ_PIN` *(optional)*: set if you want to require a PIN before reading data
4. Select `setupLedger` and click **Run**, then authorize Google Sheets and Google Drive access.
5. Click **Deploy → New deployment → Web app**, choose **Execute as: Me** and **Who has access: Anyone**, and copy the URL ending in `/exec`.

## 2. Deploy Free on GitHub Pages

1. Push this repository to GitHub on the `main` branch.
2. In your GitHub repo, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The included `.github/workflows/deploy.yml` workflow builds `dist/` with relative paths (`base: './'`) and publishes your HTTPS PWA automatically at `https://<username>.github.io/<repo>/`.
4. Open the published HTTPS URL on each operator's phone, tap **Install App**, open **Cloud & Deploy**, paste your Apps Script `/exec` URL, and tap **Sync Cloud**.
