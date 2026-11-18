# LeadsCRM

Fameo's lead-pipeline CRM (static app + Firebase). The main UI is `app.html`; the shareable roster is `roster.html`.

## Unilever lead export — downloads

`exports/` contains a cleaned 20-contact lead list built from a pasted Apollo/LinkedIn-style export whose mailto links had been mangled. All files are downloadable from the **Lead Sheet** preview page (the preview server forces `Content-Disposition: attachment`):

| File | What it is |
| --- | --- |
| `Unilever_Brand_Marketing_Leads.xlsx` | The Excel workbook. Sheets: **Leads** (original 7 columns, filterable), **Summary**, **CRM Import** (column order of the app's CSV export), **Read Me**. |
| `Unilever_Brand_Marketing_Leads.pdf` | One-page A3-landscape printable sheet with the same 20 leads. |
| `Unilever_Brand_Marketing_Leads.csv` | UTF-8 CSV copy of the Leads sheet. |
| `leads-sheet.html` | Browser-viewable Excel-style grid with search plus Excel / PDF / CSV download buttons. |

Direct download URLs on the preview server: `/download/Unilever_Brand_Marketing_Leads.xlsx`, `/download/Unilever_Brand_Marketing_Leads.pdf`, `/download/Unilever_Brand_Marketing_Leads.csv`. Append `?inline=1` to a file URL to view the PDF in the browser instead of downloading it.

Everything is generated from the `LEADS` list in `scripts/build_leads_workbook.py`:

```bash
pip install openpyxl reportlab
python3 scripts/build_leads_workbook.py
python3 scripts/serve_preview.py   # lead sheet + downloads on 0.0.0.0:3000
```

Blank cells mean the source did not supply a value; amber cells are values already masked in the source (`+91 91•••Masked`, `Masked@live.com`). No contact data was looked up or enriched externally — verify addresses before outreach.
