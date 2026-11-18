#!/usr/bin/env python3
"""Build the Unilever brand & marketing leads workbook.

The source was a single pasted block of text (an Apollo/LinkedIn-style lead
table) whose markdown mailto links had been mangled: company-size fragments
("employees", "N/A") were glued to the front of email hrefs, and work/personal
email local parts were concatenated into one link. LEADS below is the cleaned,
reconstructed version of that data - it is the single source of truth for both
the .xlsx and the .csv deliverables.

Usage:  python3 scripts/build_leads_workbook.py
Needs:  openpyxl, reportlab  (pip install openpyxl reportlab)
Output: exports/Unilever_Brand_Marketing_Leads.xlsx   (downloadable workbook)
        exports/Unilever_Brand_Marketing_Leads.pdf    (printable one-page sheet)
        exports/Unilever_Brand_Marketing_Leads.csv
        exports/leads-sheet.html                      (browser preview + downloads)
"""

from __future__ import annotations

import csv
import html
import json
import math
from collections import Counter
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "exports"
XLSX_PATH = OUT_DIR / "Unilever_Brand_Marketing_Leads.xlsx"
PDF_PATH = OUT_DIR / "Unilever_Brand_Marketing_Leads.pdf"
CSV_PATH = OUT_DIR / "Unilever_Brand_Marketing_Leads.csv"
HTML_PATH = OUT_DIR / "leads-sheet.html"

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")

HEADERS = [
    "Full Name",
    "Title / Headline",
    "Company",
    "Company Size",
    "Work Email",
    "Personal Email",
    "Phone Number",
]

# (full name, title/headline, company, company size, work email,
#  personal email, phone number). "" = not provided in the source.
LEADS = [
    (
        "Ranjani Krishnaswamy",
        "Chief Marketing Officer",
        "Titan Company Limited / Unilever",
        "10001+ employees",
        "ranjani.krishnaswamy@unilever.com",
        "ranjani2010@gmail.com",
        "",
    ),
    (
        "Madhavi Maruwada",
        "Brand Management @ Unilever | Digital Marketing, Communications & Strategy | Ex- TATA, Tesco",
        "Unilever",
        "10001+ employees",
        "madhavi.maruwada@unilever.com",
        "madhavi.hsm@gmail.com",
        "",
    ),
    (
        "Khushi Shah",
        "Marketing @ Unilever Brand Management | Growth Strategy",
        "Unilever",
        "10001+ employees",
        "khushi.shah@unilever.com",
        "",
        "",
    ),
    (
        "Dhruvil Patel",
        "Brand Management at Unilever",
        "Unilever",
        "10001+ employees",
        "dhruvil.patel@unilever.com",
        "dhruvil87@gmail.com",
        "",
    ),
    (
        "Preksha Chhajer",
        "Preksha Photography | PrekshaClicks",
        "Unilever",
        "N/A",
        "preksha.chhajer@unilever.com",
        "prekshachhajer@yahoo.com",
        "",
    ),
    (
        "Paresh Lokhande",
        "Brand Building at Hindustan Unilever Limited",
        "Unilever",
        "10001+ employees",
        "paresh@unilever.com",
        "paresh.lokhande@gmail.com",
        "",
    ),
    (
        "Keha Sagar Gupta",
        "Brand Management | FMCG Marketing Specialist | Beauty, Personal Care & Packaged Foods",
        "Unilever",
        "10001+ employees",
        "keha.sagar@unilever.com",
        "kehasagar1@gmail.com",
        "",
    ),
    (
        "Anupama Saikia",
        "Chief Marketing Officer | Unilever | UNICEF | Growing Brands with Purpose",
        "Unilever",
        "51 - 200 employees",
        "anupama.saikia@unilever.com",
        "",
        "",
    ),
    (
        "Jharna Gajwani",
        "Senior Brand Manager, Unilever",
        "Unilever",
        "10001+ employees",
        "jharna@unilever.com",
        "jharna.gajwani@gmail.com",
        "",
    ),
    (
        "Raisa Chakravarty",
        "Senior Brand Manager at Hindustan Unilever Limited",
        "Unilever",
        "10001+ employees",
        "raisa.chakravarty@unilever.com",
        "raisachakravarty@gmail.com",
        "+91 91•••Masked",
    ),
    (
        "Vidisha Garg",
        "Senior Brand Manager - Lakme",
        "Unilever",
        "10001+ employees",
        "vidisha.garg@unilever.com",
        "vidishagarg5@gmail.com",
        "",
    ),
    (
        "Anil Kulkarni",
        "Strategy & Leadership Coach",
        "Unilever",
        "N/A",
        "anil@unilever.com",
        "1593.kulkarni@gmail.com",
        "+91 98•••Masked",
    ),
    (
        "Navashree Bharadwaj",
        "Senior Brand Manager | Unilever",
        "Unilever",
        "10001+ employees",
        "navashree.bharadwaj@unilever.com",
        "navashreeb@gmail.com",
        "",
    ),
    (
        "Maulik Mehta",
        "Senior Brand Manager at Unilever",
        "Unilever",
        "10001+ employees",
        "",
        "Masked@live.com",
        "+91 98•••Masked",
    ),
    (
        "Aneri Shah",
        "Sr. Brand Manager at Unilever | Ex-Nykaa",
        "Unilever",
        "10001+ employees",
        "aneri.shah@unilever.com",
        "",
        "",
    ),
    (
        "Chandran Dharmarajan",
        "CEO, Vintegra | Strategy Consulting, Brand Identity | Brand Strategy Execution",
        "Unilever",
        "10001+ employees",
        "chandran@unilever.com",
        "chandran.dharmarajan@gmail.com",
        "+91 91•••Masked",
    ),
    (
        "Hemank Mehta",
        "Senior Brand Manager at Unilever",
        "Unilever",
        "10001+ employees",
        "hemank.mehta@unilever.com",
        "mehtahemank@gmail.com",
        "+91 99•••Masked",
    ),
    (
        "Mihir Joshi",
        "FMCG, Product and Growth || Unilever || BurnCal",
        "Unilever",
        "10001+ employees",
        "mihir.joshi@unilever.com",
        "joshimihir2007@gmail.com",
        "",
    ),
    (
        "Vipul Chaturvedi",
        "Senior Brand Manager at Hindustan Unilever Ltd",
        "Unilever",
        "10001+ employees",
        "vipul@unilever.com",
        "vipulbhu@yahoo.com",
        "",
    ),
    (
        "Shardul Gayal",
        "Global Brand Management at HUL Ex - Star Network | Ex - Percept Group | Ex - Marching Ants",
        "Unilever",
        "10001+ employees",
        "shardul.gayal@unilever.com",
        "",
        "",
    ),
]

# Fameo CRM palette
INK = "141413"
CREAM = "FAF8F3"
BAND = "F6F3EC"
LINE = "E6E0D3"
ACCENT = "C84B31"
GREEN = "144A2B"
MUTED = "7A7166"
AMBER_BG = "FFF0E2"
AMBER_INK = "9A5B2C"
WHITE = "FFFFFF"

THIN_LINE = Side(style="hair", color=LINE)
BOTTOM_BORDER = Border(bottom=THIN_LINE)

CRM_HEADERS = [
    "Client Name", "Phone", "Email", "Client Type", "Category", "Budget",
    "City", "Handle", "Status", "Talked Today", "Last Talked At",
    "Notes", "Added By", "Created At",
]


def is_masked(value: str) -> bool:
    return "masked" in value.lower() or "•••" in value


def email_domain(value: str) -> str:
    return value.rsplit("@", 1)[-1].lower() if "@" in value else ""


def role_group(title: str) -> str:
    t = title.lower()
    if "chief " in t or t.startswith("ceo"):
        return "Chief / CEO"
    if "sr. brand manager" in t or "senior brand manager" in t:
        return "Senior / Sr. Brand Manager"
    return "Other brand & marketing roles"


def write_leads_sheet(wb: Workbook) -> None:
    ws = wb.active
    ws.title = "Leads"
    ws.sheet_properties.tabColor = ACCENT
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:G{len(LEADS) + 1}"

    widths = [26, 60, 32, 20, 40, 34, 21]
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width

    ws.row_dimensions[1].height = 30
    for col, header in enumerate(HEADERS, start=1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = PatternFill("solid", fgColor=INK)
        cell.font = Font(name="Calibri", size=11, bold=True, color=WHITE)
        cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    # orange accent rule under the header
    for col in range(1, len(HEADERS) + 1):
        ws.cell(row=1, column=col).border = Border(bottom=Side(style="medium", color=ACCENT))

    for row_idx, lead in enumerate(LEADS, start=2):
        band = BAND if row_idx % 2 == 0 else WHITE
        for col_idx, value in enumerate(lead, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value or None)
            cell.fill = PatternFill("solid", fgColor=band)
            cell.border = BOTTOM_BORDER
            cell.alignment = Alignment(
                horizontal="left", vertical="center", wrap_text=(col_idx == 2), indent=1
            )
            cell.number_format = "@"  # keep phones / emails as literal text
            cell.font = Font(name="Calibri", size=10, color=INK)

            if col_idx == 1:
                cell.font = Font(name="Calibri", size=10, bold=True, color=INK)

            if col_idx in (5, 6) and value and not is_masked(value):
                cell.hyperlink = f"mailto:{value}"
                cell.font = Font(name="Calibri", size=10, color=GREEN, underline="single")

            if value and is_masked(value):
                cell.fill = PatternFill("solid", fgColor=AMBER_BG)
                cell.font = Font(name="Calibri", size=10, italic=True, color=AMBER_INK)
                cell.comment = Comment(
                    "Partially redacted in the source lead list. Only the visible "
                    "characters are recorded here - do not treat as a complete contact.",
                    "LeadsCRM",
                )

        # tall enough for wrapped headlines
        title_lines = max(1, math.ceil(len(lead[1]) / 58))
        ws.row_dimensions[row_idx].height = max(27, 15 * title_lines + 9)

    ws.print_title_rows = "1:1"
    ws.print_options.horizontalCentered = True
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_area = f"A1:G{len(LEADS) + 1}"


def write_summary_sheet(wb: Workbook) -> None:
    ws = wb.create_sheet("Summary")
    ws.sheet_properties.tabColor = GREEN
    ws.sheet_view.showGridLines = False
    for col, width in zip("ABCD", (34, 18, 18, 18)):
        ws.column_dimensions[col].width = width

    ws.merge_cells("A1:D1")
    title = ws["A1"]
    title.value = "UNILEVER  /  BRAND & MARKETING LEADS"
    title.fill = PatternFill("solid", fgColor=INK)
    title.font = Font(name="Calibri", size=14, bold=True, color=WHITE)
    title.alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[1].height = 36
    for col in range(1, 5):
        ws.cell(row=1, column=col).fill = PatternFill("solid", fgColor=INK)

    ws.merge_cells("A2:D2")
    ws["A2"] = "Source: pasted lead list  ·  Compiled 18 Nov 2026  ·  Sheet 1 holds the full, unmodified column set"
    ws["A2"].font = Font(name="Calibri", size=10, italic=True, color=MUTED)
    ws["A2"].alignment = Alignment(indent=1, vertical="center")
    ws.row_dimensions[2].height = 22

    row = 4

    def section(label: str) -> None:
        nonlocal row
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
        cell = ws.cell(row=row, column=1, value=label.upper())
        cell.font = Font(name="Calibri", size=10, bold=True, color=ACCENT)
        cell.border = Border(bottom=Side(style="thin", color=ACCENT))
        cell.alignment = Alignment(vertical="center", indent=1)
        ws.row_dimensions[row].height = 24
        row += 1

    def kv(label: str, value, note: str = "") -> None:
        nonlocal row
        lc = ws.cell(row=row, column=1, value=label)
        vc = ws.cell(row=row, column=2, value=value)
        lc.font = Font(name="Calibri", size=10, color=INK)
        vc.font = Font(name="Calibri", size=11, bold=True, color=GREEN)
        vc.alignment = Alignment(horizontal="left", indent=1)
        if note:
            ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=4)
            nc = ws.cell(row=row, column=3, value=note)
            nc.font = Font(name="Calibri", size=9, italic=True, color=MUTED)
            nc.alignment = Alignment(vertical="center", wrap_text=True)
        for col in range(1, 5):
            ws.cell(row=row, column=col).border = BOTTOM_BORDER
        ws.row_dimensions[row].height = 21
        row += 1

    work_emails = [l[4] for l in LEADS if l[4] and not is_masked(l[4])]
    personal = [l[5] for l in LEADS if l[5] and not is_masked(l[5])]
    personal_masked = [l[5] for l in LEADS if l[5] and is_masked(l[5])]
    phones = [l[6] for l in LEADS if l[6]]
    sizes = Counter(l[3] for l in LEADS)
    roles = Counter(role_group(l[1]) for l in LEADS)
    domains = Counter(email_domain(e) for e in personal)

    section("At a glance")
    kv("Total leads", len(LEADS))
    kv("Companies represented", len({l[2] for l in LEADS}), "All rows are Unilever / HUL-related")
    kv("Work emails available", len(work_emails), "1 row has no work email")
    kv("Personal emails available", len(personal), "+ 1 redacted (Masked@live.com)")
    kv("Phone numbers present", len(phones), "All 5 are partially masked in the source")
    kv("Complete contact rows", sum(1 for l in LEADS if l[4] and l[5] and not is_masked(l[5])), "Work + personal email, no phone needed")
    row += 1

    section("Company size")
    for size, count in sorted(sizes.items(), key=lambda kv_: -kv_[1]):
        kv(size, count)
    row += 1

    section("Role mix  (indicative, based on headline text)")
    for group, count in sorted(roles.items(), key=lambda kv_: -kv_[1]):
        kv(group, count)
    row += 1

    section("Personal email domains")
    for domain, count in sorted(domains.items(), key=lambda kv_: -kv_[1]):
        kv(domain, count)
    kv("(redacted)", len(personal_masked))
    row += 1

    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
    ws.cell(row=row, column=1, value="Blank cells = not supplied in the source. Amber cells = data the source had already masked. See the 'Read Me' sheet before using these contacts.").font = Font(
        name="Calibri", size=9, italic=True, color=MUTED
    )
    ws.cell(row=row, column=1).alignment = Alignment(wrap_text=True, vertical="top", indent=1)
    ws.row_dimensions[row].height = 34
    ws.freeze_panes = "A3"


def crm_notes(lead: tuple[str, ...]) -> str:
    bits = [f"Title: {lead[1]}", f"Company: {lead[2]}", f"Size: {lead[3]}"]
    if lead[5]:
        bits.append(f"Personal email: {lead[5]}")
    if lead[6]:
        bits.append(f"Phone (partial): {lead[6]}")
    bits.append("Source: pasted Unilever brand marketing lead list. Verify before outreach.")
    return " | ".join(bits)


def write_crm_sheet(wb: Workbook) -> None:
    """Paste-ready rows in the exact column order used by the CRM's CSV export."""
    ws = wb.create_sheet("CRM Import")
    ws.sheet_properties.tabColor = "1D6F42"
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:N{len(LEADS) + 1}"

    widths = [24, 16, 38, 14, 24, 12, 12, 14, 14, 14, 18, 90, 16, 20]
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width

    ws.row_dimensions[1].height = 28
    for col, header in enumerate(CRM_HEADERS, start=1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = PatternFill("solid", fgColor=INK)
        cell.font = Font(name="Calibri", size=10, bold=True, color=WHITE)
        cell.alignment = Alignment(vertical="center", indent=1)
        cell.border = Border(bottom=Side(style="medium", color=ACCENT))

    for row_idx, lead in enumerate(LEADS, start=2):
        name, title, company, size, work, personal, phone = lead
        usable_phone = "" if is_masked(phone) else phone
        primary_email = work or ("" if is_masked(personal) else personal)
        values = [
            name,
            usable_phone,
            primary_email,
            "Brand",
            "FMCG / Brand Marketing",
            "",
            "",
            "",
            "Not Called",
            "No",
            "",
            crm_notes(lead),
            "",
            "",
        ]
        band = BAND if row_idx % 2 == 0 else WHITE
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row_idx, column=col, value=value or None)
            cell.fill = PatternFill("solid", fgColor=band)
            cell.border = BOTTOM_BORDER
            cell.number_format = "@"
            cell.font = Font(name="Calibri", size=9, color=INK)
            cell.alignment = Alignment(vertical="center", wrap_text=(col == 12), indent=1)
        ws.row_dimensions[row_idx].height = 34

    ws.print_title_rows = "1:1"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True


def write_readme_sheet(wb: Workbook) -> None:
    ws = wb.create_sheet("Read Me")
    ws.sheet_properties.tabColor = "7A7166"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 112

    ws.merge_cells("A1:B1")
    ws["A1"] = "READ ME  /  HOW THIS WORKBOOK WAS BUILT"
    ws["A1"].fill = PatternFill("solid", fgColor=INK)
    ws["A1"].font = Font(name="Calibri", size=13, bold=True, color=WHITE)
    ws["A1"].alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[1].height = 34

    blocks = [
        ("Leads", "The 20 leads exactly as supplied, in the 7 columns of the original table: Full Name, Title / Headline, Company, Company Size, Work Email, Personal Email, Phone Number. Filter buttons, frozen header, clickable mailto links and print setup are applied."),
        ("Summary", "Counts, company-size split, an indicative role mix and email-domain split. All figures are calculated from the Leads sheet."),
        ("CRM Import", "The same 20 leads reshaped into the column order of the Lead Database CSV export in this repo (Client Name, Phone, Email, Client Type, ...). Useful for pasting into the app's Excel-style view or a future bulk import. Masked phones are left blank rather than written in as fake numbers; originals are kept in the Notes column."),
        ("Source cleanup", "The pasted text was one unbroken block with broken markdown mailto links. Company-size fragments such as 'employees' and 'N/A' were glued to the front of email hrefs, and the work-email address and personal-email local part were concatenated into a single link. Those were split back into separate work and personal email addresses; '&amp;' was decoded to '&' and a few stray spaces in headlines were tidied."),
        ("Blank cells", "An empty cell means the source did not provide that value. No data was looked up, guessed or enriched from outside the pasted text."),
        ("Amber cells", "Values the source had already redacted (for example '+91 91•••Masked' or 'Masked@live.com') are kept verbatim but coloured amber and commented. They are NOT complete contact details."),
        ("N/A company size", "Two rows (Preksha Chhajer, Anil Kulkarni) had no company size in the source; this is shown as 'N/A', not as a missing cell."),
        ("Two-company row", "Ranjani Krishnaswamy's company cell reads 'Titan Company Limited / Unilever' because that is how it appeared in the source."),
        ("Before outreach", "Email addresses were reconstructed from concatenated source text. Confirm deliverability and consent / compliance before adding anyone to a campaign."),
        ("Regenerate", "Run: python3 scripts/build_leads_workbook.py  (requires openpyxl). It rewrites both the .xlsx and the UTF-8 CSV in the exports/ folder from the LEADS list in that script."),
    ]

    row = 3
    for label, text in blocks:
        lc = ws.cell(row=row, column=1, value="•")
        lc.font = Font(name="Calibri", size=11, bold=True, color=ACCENT)
        lc.alignment = Alignment(horizontal="center", vertical="top")
        tc = ws.cell(row=row, column=2)
        tc.value = f"{label}  —  {text}"
        tc.font = Font(name="Calibri", size=10, color=INK)
        tc.alignment = Alignment(wrap_text=True, vertical="top", indent=1)
        # bold the label via a rich text run is not needed; colour the row's marker
        ws.row_dimensions[row].height = 15 * (max(1, math.ceil((len(label) + len(text) + 5) / 105)) + 1) + 6
        row += 1

    ws.freeze_panes = "A3"


def write_csv() -> None:
    with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.writer(fh)
        writer.writerow(HEADERS)
        writer.writerows(LEADS)


def write_pdf() -> None:
    """Render the same 20 leads as a printable, downloadable A3-landscape PDF."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A3, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    # DejaVu covers the bullets / em-dashes in the masked source values.
    regular, bold, mono, serif = "Helvetica", "Helvetica-Bold", "Courier", "Times-Roman"
    if (FONT_DIR / "DejaVuSans.ttf").exists():
        pdfmetrics.registerFont(TTFont("DJ", str(FONT_DIR / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("DJ-Bold", str(FONT_DIR / "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFont(TTFont("DJ-Mono", str(FONT_DIR / "DejaVuSansMono.ttf")))
        pdfmetrics.registerFont(TTFont("DJ-Serif", str(FONT_DIR / "DejaVuSerif.ttf")))
        regular, bold, mono, serif = "DJ", "DJ-Bold", "DJ-Mono", "DJ-Serif"

    c_ink = colors.HexColor("#141413")
    c_accent = colors.HexColor("#C84B31")
    c_green = colors.HexColor("#144A2B")
    c_muted = colors.HexColor("#787268")
    c_line = colors.HexColor("#D8DEE4")
    c_band = colors.HexColor("#F6F3EC")
    c_amber_bg = colors.HexColor("#FFF0E2")
    c_amber_ink = colors.HexColor("#9A5B2C")

    def style(name, **kw):
        opts = dict(
            fontName=regular, fontSize=8.2, leading=10.8,
            textColor=c_ink, alignment=0,
        )
        opts.update(kw)
        return ParagraphStyle(name, **opts)

    s_head = style("head", fontName=bold, fontSize=8.2, leading=11, textColor=colors.white)
    s_cell = style("cell")
    s_name = style("name", fontName=bold)
    s_title = style("title_cell", fontSize=8.0, leading=10.6)
    s_email = style("email", fontName=mono, fontSize=7.6, leading=10.2,
                    textColor=c_green, wordWrap="CJK")
    s_masked = style("masked", fontName=mono, fontSize=7.6, leading=10.2,
                     textColor=c_amber_ink, wordWrap="CJK")
    s_blank = style("blank", textColor=c_muted)
    s_num = style("num", fontName=mono, fontSize=7.6, textColor=c_muted)

    def para(value, st, link=False):
        safe = html.escape(str(value))
        if link:
            safe = f'<link href="mailto:{safe}" color="#144A2B">{safe}</link>'
        return Paragraph(safe, st)

    table_data = [[Paragraph(h, s_head) for h in ["#"] + HEADERS]]
    masked_cells = []
    for idx, lead in enumerate(LEADS, start=1):
        row = [Paragraph(str(idx), s_num)]
        for ci, value in enumerate(lead):
            col = ci + 1
            if not value:
                row.append(Paragraph("—", s_blank))
            elif is_masked(value):
                row.append(para(value, s_masked))
                masked_cells.append((col, idx))
            elif ci in (4, 5):
                row.append(para(value, s_email, link=True))
            elif ci == 0:
                row.append(para(value, s_name))
            elif ci == 1:
                row.append(para(value, s_title))
            else:
                row.append(para(value, s_cell))
        table_data.append(row)

    widths = [24, 120, 300, 108, 98, 190, 172, 98]  # 1110pt of 1138pt usable
    table_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), c_ink),
        ("LINEBELOW", (0, 0), (-1, 0), 2.2, c_accent),
        ("GRID", (0, 0), (-1, -1), 0.35, c_line),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_band]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for col, row_no in masked_cells:
        table_cmds.append(("BACKGROUND", (col, row_no), (col, row_no), c_amber_bg))

    grid = Table(table_data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    grid.setStyle(TableStyle(table_cmds))

    s_eyebrow = style("eyebrow", fontName=bold, fontSize=8, leading=11, textColor=c_accent)
    s_doc_title = ParagraphStyle(
        "doc_title", fontName=serif, fontSize=23, leading=27, textColor=c_ink
    )
    s_sub = style("sub", fontSize=8.2, leading=11.5, textColor=c_muted)
    s_note = style("note", fontSize=7.4, leading=10.4, textColor=c_muted)
    s_metric_label = style("mlabel", fontName=bold, fontSize=7, leading=9, textColor=c_muted)
    s_metric_value = style("mvalue", fontName=bold, fontSize=14, leading=17, textColor=c_green)

    metrics = [
        [Paragraph("TOTAL LEADS", s_metric_label), Paragraph("WORK EMAILS", s_metric_label),
         Paragraph("PERSONAL EMAILS", s_metric_label), Paragraph("MASKED PHONES", s_metric_label)],
        [Paragraph(str(len(LEADS)), s_metric_value),
         Paragraph(str(sum(1 for l in LEADS if l[4] and not is_masked(l[4]))), s_metric_value),
         Paragraph(str(sum(1 for l in LEADS if l[5] and not is_masked(l[5]))), s_metric_value),
         Paragraph(str(sum(1 for l in LEADS if l[6])), s_metric_value)],
    ]
    metric_table = Table(metrics, colWidths=[277.5] * 4, hAlign="LEFT")
    metric_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAF8F3")),
        ("LINEBELOW", (0, 1), (-1, 1), 0.8, colors.HexColor("#E6E0D3")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E6E0D3")),
    ]))

    page_w = landscape(A3)[0]

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(regular, 7)
        canvas.setFillColor(c_muted)
        canvas.drawString(26, 15, "Fameo LeadsCRM  ·  Unilever Brand & Marketing Leads  ·  18 Nov 2026")
        canvas.drawRightString(page_w - 26, 15, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        str(PDF_PATH), pagesize=landscape(A3),
        leftMargin=26, rightMargin=26, topMargin=22, bottomMargin=26,
        title="Unilever — Brand & Marketing Leads",
        author="Fameo LeadsCRM",
        subject="20 cleaned brand & marketing leads from a pasted lead export",
    )
    story = [
        Paragraph("FAMEO LEADSCRM  ·  LEAD DATABASE  ·  EXPORT SHEET", s_eyebrow),
        Spacer(1, 4),
        Paragraph('Unilever <font color="#C84B31">Lead Sheet</font>', s_doc_title),
        Spacer(1, 3),
        Paragraph(
            "20 brand &amp; marketing contacts cleaned from a pasted lead export. "
            "Same 7 columns and same values as the Excel workbook and CSV.",
            s_sub,
        ),
        Spacer(1, 12),
        metric_table,
        Spacer(1, 12),
        grid,
        Spacer(1, 10),
        Paragraph(
            "<b>Reading this sheet:</b> a blank cell means the source did not supply that field. "
            "Amber cells are values already masked in the source (for example +91 91•••Masked or "
            "Masked@live.com) and are not complete contact details. Work and personal email addresses "
            "were reconstructed from concatenated mailto links in the pasted text; verify deliverability "
            "and consent before outreach.",
            s_note,
        ),
        Spacer(1, 4),
        Paragraph(
            "Companion workbook: Unilever_Brand_Marketing_Leads.xlsx (Leads, Summary, CRM Import, Read Me).",
            s_note,
        ),
    ]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unilever Leads — Excel Sheet</title>
<link rel="stylesheet" href="../fameo-theme.css">
<style>
  body { margin:0; background:#F4F0E8; color:#141413;
         font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif; }
  .page { max-width:1500px; margin:0 auto; padding:18px 22px 56px; }
  .strip { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;
           font-family:'JetBrains Mono',monospace; font-size:.68rem; letter-spacing:.05em;
           text-transform:uppercase; color:#787268; border-bottom:1px solid rgba(20,20,19,.14);
           padding-bottom:10px; }
  .hero { display:flex; justify-content:space-between; align-items:flex-end; gap:20px;
          flex-wrap:wrap; margin:26px 0 18px; }
  .eyebrow { font-family:'JetBrains Mono',monospace; font-size:.68rem; letter-spacing:.12em;
             text-transform:uppercase; color:#C84B31; font-weight:600; }
  h1 { font-family:'Instrument Serif',Georgia,serif; font-weight:400; font-size:2.9rem;
       line-height:1.05; margin:8px 0 6px; }
  h1 em { color:#C84B31; font-style:italic; }
  .sub { color:#4A4742; font-size:.86rem; max-width:640px; margin:0; line-height:1.55; }
  .actions { display:flex; gap:9px; flex-wrap:wrap; }
  .btn { display:inline-flex; align-items:center; gap:7px; text-decoration:none;
         border-radius:8px; padding:10px 16px; font-size:.8rem; font-weight:600;
         border:1px solid #141413; transition:transform .12s, background .12s; }
  .btn:hover { transform:translateY(-1px); }
  .btn.primary { background:#141413; color:#FAF8F3; }
  .btn.ghost { background:transparent; color:#141413; }
  .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
             gap:10px; margin:0 0 18px; }
  .metric { background:#FAF8F3; border:1px solid rgba(20,20,19,.13); border-radius:10px;
            padding:12px 15px; }
  .metric span { display:block; font-size:.68rem; text-transform:uppercase;
                 letter-spacing:.07em; color:#787268; font-weight:600; }
  .metric b { display:block; margin-top:5px; font-family:'JetBrains Mono',monospace;
              font-size:1.4rem; color:#144A2B; }
  .excel-toolbar input { font-family:'JetBrains Mono',monospace; font-size:.74rem;
      padding:7px 10px; border:1px solid #B7DEC8; border-radius:6px; min-width:210px;
      background:#fff; outline:none; }
  .excel-toolbar input:focus { border-color:#1D6F42; box-shadow:0 0 0 2px rgba(29,111,66,.12); }
  #visibleCount { white-space:nowrap; font-weight:600; }
  .excel-cell.wide { min-width:340px; max-width:430px; white-space:normal; line-height:1.4; }
  .excel-cell.name { font-weight:600; min-width:170px; }
  .excel-cell.mono { font-family:'JetBrains Mono',monospace; font-size:.74rem; min-width:210px; }
  .excel-cell.blank { color:#A6ADA4; }
  .excel-cell.masked { background:#FFF0E2 !important; color:#9A5B2C; font-style:italic; }
  .excel-cell.selected { outline:2px solid #1D6F42; outline-offset:-2px; }
  .excel-table td a.email { color:#144A2B; text-decoration:none; border-bottom:1px dotted #144A2B; }
  .excel-table td a.email:hover { color:#C84B31; border-color:#C84B31; }
  .note { margin-top:16px; font-size:.76rem; line-height:1.6; color:#787268; max-width:900px; }
  .note strong { color:#141413; }
  @media (max-width:640px) { h1 { font-size:2.1rem; } .page { padding:14px 12px 40px; } }
</style>
</head>
<body>
<div class="page">
  <div class="strip"><span>Fameo LeadsCRM · Lead Database</span><span>Unilever / Brand &amp; Marketing · 18 Nov 2026</span></div>

  <div class="hero">
    <div>
      <div class="eyebrow"><span style="color:#C84B31">●</span> 02 — Lead Database / Excel Sheet</div>
      <h1>Unilever <em>Lead Sheet</em></h1>
      <p class="sub">20 brand &amp; marketing contacts, cleaned from the pasted lead export. Filter below, or use the buttons to download the Excel workbook, the PDF, or the CSV. All three contain the same 20 leads.</p>
    </div>
    <div class="actions">
      <a class="btn primary" href="__XLSX__" download>↓ Excel (.xlsx)</a>
      <a class="btn primary" href="__PDF__" download style="background:#C84B31;border-color:#C84B31">↓ PDF</a>
      <a class="btn ghost" href="__CSV__" download>↓ CSV</a>
      <a class="btn ghost" href="__PDF__?inline=1" target="_blank" rel="noopener" style="font-size:.72rem">Preview PDF ↗</a>
    </div>
  </div>

  <div class="metrics">
    <div class="metric"><span>Total leads</span><b>__TOTAL__</b></div>
    <div class="metric"><span>Work emails</span><b>__WORK__</b></div>
    <div class="metric"><span>Personal emails</span><b>__PERSONAL__</b></div>
    <div class="metric"><span>Masked phones</span><b>__PHONES__</b></div>
  </div>

  <div class="excel-wrap">
    <div class="excel-toolbar">
      <div class="excel-fx-bar"><span class="excel-fx-tag">fx</span><span id="fx">Click any cell to inspect its value</span></div>
      <input id="search" type="search" placeholder="Filter leads (name, title, email…)">
      <span id="visibleCount">__TOTAL__ / __TOTAL__ rows</span>
    </div>
    <table class="excel-table">
      <thead>
        <tr class="excel-col-letters"><th class="excel-row-num"></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th><th>G</th></tr>
        <tr class="excel-headers"><th class="excel-row-num">#</th>__HEAD_HTML__</tr>
      </thead>
      <tbody id="tbody"></tbody>
      <tfoot><tr class="excel-footer-row"><td class="excel-row-num">Σ</td><td colspan="7" id="footerText"></td></tr></tfoot>
    </table>
  </div>

  <p class="note"><strong>Reading the sheet:</strong> a blank cell means the source did not supply that field. Amber cells are values the source had already masked (for example <code>+91 91•••Masked</code> or <code>Masked@live.com</code>) and are not complete contact details. The workbook also contains a <strong>Summary</strong>, a <strong>CRM Import</strong> sheet shaped like this app's CSV export, and a <strong>Read Me</strong> explaining how the mangled mailto links were reconstructed. Verify addresses before outreach.</p>
</div>

<script>
const HEADERS = __HEADERS_JSON__;
const LEADS = __LEADS_JSON__;
const COLS = ['A','B','C','D','E','F','G'];
const tbody = document.getElementById('tbody');
const search = document.getElementById('search');
const fx = document.getElementById('fx');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const masked = (v) => typeof v === 'string' && (v.toLowerCase().includes('masked') || v.includes('•••'));

function render() {
  const q = search.value.trim().toLowerCase();
  const rows = LEADS.map((lead, i) => ({lead, i}))
                    .filter(({lead}) => !q || lead.join(' ').toLowerCase().includes(q));
  tbody.innerHTML = rows.map(({lead, i}) => {
    const rowNum = i + 2;
    const cells = lead.map((v, ci) => {
      const ref = COLS[ci] + rowNum;
      const cls = ['excel-cell'];
      if (ci === 1) cls.push('wide');
      if (ci === 0) cls.push('name');
      if (ci >= 4) cls.push('mono');
      if (!v) cls.push('blank');
      if (v && masked(v)) cls.push('masked');
      let inner;
      if (!v) inner = '—';
      else if ((ci === 4 || ci === 5) && !masked(v)) inner = '<a class="email" href="mailto:' + esc(v) + '">' + esc(v) + '</a>';
      else inner = esc(v);
      return '<td class="' + cls.join(' ') + '" data-ref="' + ref + '" data-val="' + esc(v) + '">' + inner + '</td>';
    }).join('');
    return '<tr><td class="excel-row-num">' + (i + 1) + '</td>' + cells + '</tr>';
  }).join('');
  document.getElementById('visibleCount').textContent = rows.length + ' / ' + LEADS.length + ' rows';
  document.getElementById('footerText').textContent = rows.length + ' of ' + LEADS.length + ' leads shown  ·  ' +
    LEADS.filter(l => l[4] && l[5] && !masked(l[5])).length + ' with both work and personal email';
}
tbody.addEventListener('click', (e) => {
  const td = e.target.closest('td[data-ref]');
  if (!td) return;
  tbody.querySelectorAll('td.selected').forEach(c => c.classList.remove('selected'));
  td.classList.add('selected');
  fx.textContent = td.dataset.ref + '  ·  ' + (td.dataset.val || '(empty)');
});
search.addEventListener('input', render);
render();
</script>
</body>
</html>
"""


def write_html_preview() -> None:
    """A browser-viewable Excel grid, mirroring the app's own Excel Sheet view."""
    head_html = "".join(f"<th>{html.escape(h)}</th>" for h in HEADERS)
    page = (
        HTML_TEMPLATE.replace("__PDF__", html.escape(PDF_PATH.name))
        .replace("__XLSX__", html.escape(XLSX_PATH.name))
        .replace("__CSV__", html.escape(CSV_PATH.name))
        .replace("__TOTAL__", str(len(LEADS)))
        .replace("__WORK__", str(sum(1 for l in LEADS if l[4] and not is_masked(l[4]))))
        .replace("__PERSONAL__", str(sum(1 for l in LEADS if l[5] and not is_masked(l[5]))))
        .replace("__PHONES__", str(sum(1 for l in LEADS if l[6])))
        .replace("__HEAD_HTML__", head_html)
        .replace("__HEADERS_JSON__", json.dumps(HEADERS, ensure_ascii=False))
        .replace("__LEADS_JSON__", json.dumps(LEADS, ensure_ascii=False))
    )
    HTML_PATH.write_text(page, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    wb = Workbook()
    wb.properties.title = "Unilever — Brand & Marketing Leads"
    wb.properties.subject = "Cleaned lead list (20 contacts)"
    wb.properties.creator = "Fameo LeadsCRM"
    wb.properties.description = "Reconstructed from a pasted, mangled lead-list export. See the Read Me sheet."

    write_leads_sheet(wb)
    write_summary_sheet(wb)
    write_crm_sheet(wb)
    write_readme_sheet(wb)
    wb.active = 0
    wb.save(XLSX_PATH)
    write_csv()
    try:
        write_pdf()
    except ImportError as exc:
        print(f"Skipping PDF (install reportlab to enable it): {exc}")
    write_html_preview()

    # sanity check: reopen and confirm row/column counts
    check = load_workbook(XLSX_PATH, read_only=True)
    assert check["Leads"].max_row == len(LEADS) + 1
    assert check["Leads"].max_column == len(HEADERS)
    assert check["CRM Import"].max_row == len(LEADS) + 1
    assert [c.value for c in next(check["Leads"].iter_rows(min_row=1, max_row=1))] == HEADERS
    check.close()
    print(f"Wrote {XLSX_PATH.relative_to(ROOT)} ({len(LEADS)} leads, {len(wb.sheetnames)} sheets)")
    if PDF_PATH.exists():
        print(f"Wrote {PDF_PATH.relative_to(ROOT)}")
    print(f"Wrote {CSV_PATH.relative_to(ROOT)}")
    print(f"Wrote {HTML_PATH.relative_to(ROOT)} (browser preview + download links)")


if __name__ == "__main__":
    main()
