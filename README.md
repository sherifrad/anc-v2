# 🏥 ANC Follow-Up System — 2nd Edition
### Antenatal Care EMR · Private Obstetrics Clinic
**Mac · Localhost · No installation · encrypted cloud sync/backups · Mobile-ready PWA**

---

## 🚀 Start in 10 seconds

```bash
bash start.sh
```

Browser opens at **http://localhost:3000**

---

## 🔒 First Launch — Encryption Setup

On first launch you will be prompted to:
1. **Set a clinic password** (min 6 characters) — encrypts cloud sync and encrypted backups with AES-256-GCM
2. **Save your password securely** — password recovery is not currently implemented
3. OR **skip encryption** — not recommended for real patient data

> On every subsequent launch, enter your password to unlock the database.

---

## ✨ What's New in v2

| Feature | Details |
|---|---|
| **Auto-GA in all fields** | Every date field auto-calculates gestational age from LMP |
| **Structured ultrasound** | BPD, HC, AC, FL, AFI/DVP with auto-assessment, placental location |
| **Growth charts** | Intergrowth-21st + Hadlock — switchable, patient data plotted |
| **Doppler charts** | UA, MCA, DV, UtA PI with reference bands |
| **FGR risk engine** | Auto-detects small-for-gestational-age with severity grading |
| **Structured CBC** | Hb, HCT, WBC, PLT, MCV, MCH with Egyptian MOH reference ranges |
| **140+ lab tests** | All with trimester-specific normal ranges, auto-flagging |
| **Custom lab tests** | Add any test not in the dropdown, flagged manually |
| **Risk categorization** | Low 🟢 / Middle 🟡 / High 🔴 with auto-suggestion engine |
| **File attachments** | Attach images/PDFs to any scan or procedure section |
| **OCR** | Extract text from lab result images (Tesseract.js, offline-capable) |
| **Collapsible sections** | Labs, ultrasound, procedures toggle show/hide |
| **Autosave** | Saves every 5 seconds if changes detected and name has 3+ words |
| **AES-256 encryption** | Cloud sync payloads and encrypted backups are encrypted client-side |
| **PWA / Mobile** | Add to iPhone/iPad home screen, works offline |
| **PDF export** | Abnormal labs highlighted in red/orange, risk badge included |
| **Backup/restore** | Full JSON export for migration to cloud |

---

## 📋 Clinical Reference Ranges

All ranges follow **Egyptian MOH + ACOG + NICE + ATA 2017** guidelines:

- **Hemoglobin**: T1/T3 <11.0 g/dL = anemia; T2 <10.5 g/dL = anemia (Egyptian MOH)
- **TSH**: T1 <0.1 / >2.5 mIU/L; T2 <0.2 / >3.0; T3 <0.3 / >3.0 (ATA 2017)
- **FBG**: ≥92 mg/dL = GDM threshold (IADPSG)
- **AFI**: Trimester-specific ranges (ACOG/NICE); DVP 2–8 cm
- **Growth charts**: Intergrowth-21st (default) + Hadlock (switchable)
- **Doppler**: Arduini & Rizzo / ISUOG reference percentiles

---

## 📁 File Structure

```
anc-v2/
├── index.html          ← Single-page app (all views)
├── start.sh            ← Mac one-click launcher
├── manifest.json       ← PWA manifest (iOS/Android install)
├── README.md
├── css/
│   └── style.css       ← Mobile-first premium theme
└── js/
    ├── constants.js    ← Clinical reference data, ranges, chart data
    ├── crypto.js       ← AES-256-GCM encryption (SubtleCrypto)
    ├── db.js           ← LocalStorage database, autosave, backup
    ├── calc.js         ← GA, EDD, trimester, risk engine, chart builders
    ├── ui.js           ← All rendering, lab grids, tables, modals
    └── app.js          ← Main controller, events, save/load, PDF
```

---

## 💾 Data & Privacy

- Local working data is stored in **browser localStorage**
- Cloud sync payloads and encrypted backups use **AES-256-GCM** when encryption is enabled
- For production clinic use, protect the app with Cloudflare Access and protect Supabase with Auth + RLS
- **Zero telemetry** — no analytics, no external data calls
- **Backup**: Download button exports full JSON backup
- **Migration-ready**: JSON structure maps directly to PostgreSQL/MongoDB

---

## 📱 Mobile / iPhone / iPad

1. Open Safari → navigate to `http://YOUR-MAC-IP:3000`
2. Tap **Share** → **Add to Home Screen**
3. Opens as full-screen app with no browser chrome
4. Works offline after first load (Chart.js + Tesseract cached)

To find your Mac's IP: `System Settings → Wi-Fi → Details`

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘S` / `Ctrl+S` | Quick save |
| `⌘P` / `Ctrl+P` | Print (browser default) |

---

## 🔧 Troubleshooting

**Port 3000 in use?**
```bash
python3 -m http.server 3001
# Then open http://localhost:3001
```

**Forgot password?** Use your recovery phrase to restore from a JSON backup.
Data without password + no backup = unrecoverable (by design).

**Charts not loading?** Requires internet for first Chart.js load, then cached offline.

**OCR not working?** Requires internet for first Tesseract.js load (~10MB, then offline).

---

*ANC Follow-Up System v2 · 2nd Edition · 2026*
