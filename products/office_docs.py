"""office_docs.py - turn the NDIS pack's Markdown templates into Word documents, and build its evidence tracker workbook.

Both outputs are reproducible: fixed document properties and fixed timestamps inside the file, so the same Markdown
always gives byte-identical .docx and .xlsx files. Needs python-docx and openpyxl.

Markdown supported: # ## ### headings, paragraphs, > notes, - bullets, - [ ] tick boxes, 1. numbered items, | tables |,
**bold** and `code`. Text in [square brackets] is highlighted as a field to fill in.
"""
import datetime, io, re, zipfile

FIXED = datetime.datetime(2026, 11, 24, 0, 0, 0)
FOOTER = "NDIS SIL Compliance Starter Pack · A starting point, not legal advice · Check current NDIS Commission requirements"


def normalise_zip(data):
    """Rewrite an Office file's zip with fixed timestamps, keeping the entry order Office expects."""
    src = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            zi = zipfile.ZipInfo(info.filename, date_time=FIXED.timetuple()[:6])
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o100644 << 16
            data_ = src.read(info.filename)
            if info.filename == "docProps/core.xml":             # openpyxl stamps "modified" with the save time
                data_ = re.sub(rb"(<dcterms:modified[^>]*>)[^<]*(</dcterms:modified>)",
                               rb"\g<1>" + FIXED.strftime("%Y-%m-%dT%H:%M:%SZ").encode() + rb"\g<2>", data_)
            dst.writestr(zi, data_, compresslevel=9)
    return out.getvalue()


def _runs(par, text, size=None, bold_all=False):
    from docx.enum.text import WD_COLOR_INDEX
    from docx.shared import Pt
    for part in re.split(r"(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\])", text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            r = par.add_run(part[2:-2]); r.bold = True
        elif part.startswith("`") and part.endswith("`"):
            r = par.add_run(part[1:-1]); r.font.name = "Consolas"
        elif part.startswith("[") and part.endswith("]") and not part.startswith("[ ]"):
            r = par.add_run(part); r.font.highlight_color = WD_COLOR_INDEX.YELLOW
        else:
            r = par.add_run(part)
        if bold_all:
            r.bold = True
        if size:
            r.font.size = Pt(size)


def markdown_to_docx(md, title):
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.shared import Cm, Pt, RGBColor
    lines = md.replace("\r\n", "\n").split("\n")
    widest = max([len([c for c in l.strip().strip("|").split("|")]) for l in lines if l.strip().startswith("|")] or [0])
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    if widest >= 7:                                            # wide registers read better across the page
        sec.orientation = WD_ORIENT.LANDSCAPE
        sec.page_width, sec.page_height = sec.page_height, sec.page_width
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(sec, side, Cm(1.8))
    normal = doc.styles["Normal"]
    normal.font.name, normal.font.size = "Calibri", Pt(10.5)
    for name, size in (("Heading 1", 18), ("Heading 2", 13.5), ("Heading 3", 11.5)):
        st = doc.styles[name]; st.font.name = "Calibri"; st.font.size = Pt(size); st.font.color.rgb = RGBColor(0x0B, 0x2A, 0x4A)
    fp = sec.footer.paragraphs[0]
    fr = fp.add_run(FOOTER); fr.font.size = Pt(8); fr.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    props = doc.core_properties
    props.title, props.author, props.last_modified_by, props.comments = title, "", "", ""
    props.created = props.modified = props.last_printed = FIXED
    props.revision = 1

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        s = line.strip()
        if not s or s == "---":
            i += 1; continue
        if s.startswith("|"):                                   # a table: header row, separator row, body rows
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                    rows.append(cells)
                i += 1
            ncol = max(len(r) for r in rows)
            t = doc.add_table(rows=len(rows), cols=ncol)
            t.style = "Table Grid"
            small = 8.5 if ncol >= 7 else 9.5
            for ri, r in enumerate(rows):
                for ci in range(ncol):
                    cell = t.cell(ri, ci)
                    cell.paragraphs[0].text = ""
                    _runs(cell.paragraphs[0], r[ci] if ci < len(r) else "", size=small, bold_all=(ri == 0))
            body = rows[1:]
            blank = all(all(not c or re.fullmatch(r"R?\d+", c) for c in r) for r in body)
            for _ in range(max(0, 10 - len(body)) if blank else 0):  # empty registers get rows to write in
                row = t.add_row()
                for c in row.cells:
                    c.paragraphs[0].add_run(" ")
            doc.add_paragraph()
            continue
        m = re.match(r"^(#{1,3})\s+(.*)$", s)
        if m:
            doc.add_heading(m.group(2), level=len(m.group(1)))
        elif s.startswith(">"):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            _runs(p, s.lstrip("> ").strip())
            for r in p.runs:
                r.italic = True
        elif re.match(r"^- \[[ xX]\]\s+", s):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.first_line_indent = Cm(-0.6)
            p.add_run("☐  ")
            _runs(p, re.sub(r"^- \[[ xX]\]\s+", "", s))
        elif re.match(r"^[-*]\s+", s):
            indent = len(line) - len(line.lstrip())
            p = doc.add_paragraph(style="List Bullet 2" if indent >= 2 else "List Bullet")
            _runs(p, re.sub(r"^[-*]\s+", "", s))
        elif re.match(r"^\d+\.\s+", s):
            p = doc.add_paragraph(style="List Number")
            _runs(p, re.sub(r"^\d+\.\s+", "", s))
        else:
            _runs(doc.add_paragraph(), s)
        i += 1
    buf = io.BytesIO()
    doc.save(buf)
    return normalise_zip(buf.getvalue())


EVIDENCE = [
    ("Module 5A: Supported decision-making", [
        "Supported decision-making policy and procedure (approved, current)",
        "Decision-making records for a sample of participants",
        "Communication profiles and the supports used for each participant",
        "Worker training and competency assessment in supported decision-making",
        "Examples where a participant's will and preferences changed a decision",
        "Information given to participants in accessible formats",
    ]),
    ("Module 5A: Safeguarding", [
        "Safeguarding policy (approved, current)",
        "Risk register and safeguard map for each home, with dated reviews",
        "Training records: recognising and responding to abuse, neglect and exploitation",
        "Incident register showing responses and learning",
        "How participants raise concerns, including with people outside the provider",
        "Records of independent contacts (advocates, family, community) for each participant",
    ]),
    ("Module 5A: Practice governance", [
        "Practice governance framework (roles, oversight, reporting)",
        "Supervision schedule and records",
        "Competency assessments for the practices the Rules require",
        "Quality and safeguarding reports to the governing body",
        "House visit or spot-check records",
        "Evidence that incidents and complaints led to changes in practice",
    ]),
    ("Module 5A: Tenancy, housing and support agreements", [
        "Service agreements, kept separate from tenancy or accommodation agreements",
        "Records of how each participant was supported to understand their agreements",
        "Conflict-of-interest policy and register (where housing and support are related)",
        "Written arrangement for what happens to housing if a participant changes support provider",
        "Separate records of rent or board and of support charges",
    ]),
    ("Core: Rights and responsibilities", [
        "Rights information in accessible formats",
        "Privacy and consent records",
        "Complaints procedure and register",
    ]),
    ("Core: Governance and operational management", [
        "Governance structure and delegations",
        "Risk management system and register",
        "Quality management and continuous improvement register",
        "Incident management procedure and register",
        "Worker Screening Check verification for every risk-assessed role",
        "Document register with owners, versions and review dates",
    ]),
    ("Core: Provision of supports", [
        "Support plans for each participant, reviewed with them",
        "Transition and exit procedures",
    ]),
    ("Core: Support provision environment", [
        "Emergency and disaster management plan for each home",
        "Participant money and property procedures (if relevant)",
        "Medication support procedures and records (if relevant)",
    ]),
]


def evidence_tracker_xlsx():
    from openpyxl import Workbook
    from openpyxl.formatting.rule import CellIsRule
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation
    wb = Workbook()
    ws = wb.active
    ws.title = "Evidence"
    head = ["Standard or area", "Evidence item", "Where it is kept", "Owner", "Status", "Last reviewed", "Next review", "Notes"]
    ws.append(head)
    for area, items in EVIDENCE:
        for item in items:
            ws.append([area, item, "", "", "Need", None, None, ""])
    navy = PatternFill("solid", fgColor="0B2A4A")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = navy; c.alignment = Alignment(vertical="center", wrap_text=True)
    for col, width in zip("ABCDEFGH", (34, 62, 26, 16, 11, 14, 14, 30)):
        ws.column_dimensions[col].width = width
    last = ws.max_row
    for row in ws.iter_rows(min_row=2, max_row=last):
        for c in row:
            c.alignment = Alignment(vertical="top", wrap_text=True)
        row[5].number_format = row[6].number_format = "DD/MM/YYYY"
    dv = DataValidation(type="list", formula1='"Have,Partial,Need"', allow_blank=False)
    ws.add_data_validation(dv)
    dv.add("E2:E%d" % (last + 200))
    for value, colour in (("Have", "C6EFCE"), ("Partial", "FFEB9C"), ("Need", "FFC7CE")):
        ws.conditional_formatting.add("E2:E%d" % (last + 200),
                                      CellIsRule(operator="equal", formula=['"%s"' % value], fill=PatternFill("solid", fgColor=colour)))
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = "A1:H%d" % last

    sm = wb.create_sheet("Summary")
    sm.append(["Standard or area", "Have", "Partial", "Need", "Ready (%)"])
    for c in sm[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = navy
    for r, (area, _) in enumerate(EVIDENCE, start=2):
        sm.append([area] + ['=COUNTIFS(Evidence!$A:$A,$A{r},Evidence!$E:$E,"{s}")'.format(r=r, s=s) for s in ("Have", "Partial", "Need")]
                  + ['=IF(SUM(B{r}:D{r})=0,0,ROUND(B{r}/SUM(B{r}:D{r})*100,0))'.format(r=r)])
    sm.column_dimensions["A"].width = 48
    for col in "BCDE":
        sm.column_dimensions[col].width = 11

    how = wb.create_sheet("How to use")
    for line in ["Evidence tracker: NDIS SIL Compliance Starter Pack",
                 "1. For each item, record where the evidence is kept and who owns it.",
                 "2. Set Status to Have, Partial or Need. The Summary sheet updates itself.",
                 "3. Add rows for each official quality indicator you paste into the self-assessment workbook.",
                 "4. Review monthly, and before every audit.",
                 "A starting point, not legal advice. Check current NDIS Quality and Safeguards Commission requirements."]:
        how.append([line])
    how["A1"].font = Font(bold=True, size=13)
    how.column_dimensions["A"].width = 100

    wb.properties.creator = wb.properties.lastModifiedBy = ""
    wb.properties.created = wb.properties.modified = FIXED
    buf = io.BytesIO()
    wb.save(buf)
    return normalise_zip(buf.getvalue())
