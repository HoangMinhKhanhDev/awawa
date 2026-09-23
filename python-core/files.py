import re


OPT_RE = re.compile(r"^\s*([A-Da-d])[\.\)\:\-â€“]\s*(.+)$")
ANSWER_RE = re.compile(r"(?:Ä‘Ã¡p\s*Ã¡n|dap\s*an|answer|key)\s*[:\-â€“]?\s*([A-Da-d])", re.IGNORECASE)
SPLIT_RE = re.compile(r"(?:^|\n)\s*(CÃ¢u\s+\d+\s*[\.\:\-\)]?)", re.IGNORECASE)
EXPL_RE = re.compile(r"(lá»i\s*giáº£i|hÆ°á»›ng\s*dáº«n|giáº£i\s*thÃ­ch|solution)\s*[:\-â€“]?", re.IGNORECASE)


def parse_text_to_drafts(text: str):
    text = (text or "").replace("\r\n", "\n").strip()
    if not text:
        return []
    parts = SPLIT_RE.split(text)
    # parts: ['', 'CÃ¢u 1:', ' ná»™i dung...', 'CÃ¢u 2:', ' ...']
    chunks = []
    if len(parts) >= 3:
        for i in range(1, len(parts), 2):
            head = parts[i].strip()
            body = parts[i + 1] if i + 1 < len(parts) else ""
            chunks.append((head + " " + body.strip()).strip())
    else:
        # fallback: tÃ¡ch theo dÃ²ng trá»‘ng dÃ i
        chunks = [c.strip() for c in re.split(r"\n\s*\n", text) if c.strip()]
    drafts = []
    for ch in chunks:
        lines = [ln.rstrip() for ln in ch.split("\n")]
        options, content_lines, answer, expl = [], [], "", ""
        in_expl = False
        expl_lines = []
        for ln in lines:
            if EXPL_RE.search(ln):
                in_expl = True
                expl_lines.append(EXPL_RE.sub("", ln).strip())
                continue
            if in_expl:
                expl_lines.append(ln)
                continue
            m = OPT_RE.match(ln.strip())
            if m:
                options.append(m.group(2).strip())
                # Ä‘Ã¡p Ã¡n cÃ³ thá»ƒ náº±m cÃ¹ng dÃ²ng phÆ°Æ¡ng Ã¡n
                am = ANSWER_RE.search(ln)
                if am and not answer:
                    answer = am.group(1).upper()
                continue
            am = ANSWER_RE.search(ln)
            if am and not answer:
                answer = am.group(1).upper()
                # bá» dÃ²ng Ä‘Ã¡p Ã¡n khá»i ná»™i dung
                rest = ANSWER_RE.sub("", ln).strip(" :-â€“")
                if rest:
                    content_lines.append(rest)
                continue
            content_lines.append(ln)
        content = "\n".join(content_lines).strip()
        content = re.sub(r"^(CÃ¢u\s+\d+\s*[\.\:\-\)]?)\s*", "", content, flags=re.IGNORECASE).strip()
        explanation = "\n".join(expl_lines).strip()
        if len(options) >= 2:
            qtype = "trac_nghiem"
            options = (options + ["", "", "", ""])[:4]
        else:
            qtype = "tu_luan"
            options = []
            if not answer:
                # vá»›i tá»± luáº­n, pháº§n sau "ÄÃ¡p Ã¡n:" Ä‘Ã£ bá»‹ tÃ¡ch; thá»­ láº¥y dÃ²ng cuá»‘i lÃ m gá»£i Ã½
                answer = ""
        if not content:
            continue
        drafts.append({
            "content": content[:2000],
            "options": options,
            "correct_answer": answer,
            "explanation": explanation,
            "qtype": qtype,
            "difficulty": "váº­n dá»¥ng",
        })
    return drafts


def extract_file_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".txt"):
        for enc in ("utf-8", "utf-8-sig", "cp1258", "latin-1"):
            try:
                return data.decode(enc)
            except Exception:
                continue
        return data.decode("utf-8", errors="ignore")
    if name.endswith(".docx"):
        from docx import Document
        import io
        doc = Document(io.BytesIO(data))
        paras = [p.text for p in doc.paragraphs]
        # kÃ¨m báº£ng
        for tb in doc.tables:
            for row in tb.rows:
                paras.append(" | ".join(c.text for c in row.cells))
        return "\n".join(paras)
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(data))
        texts = []
        for page in reader.pages:
            try:
                texts.append(page.extract_text() or "")
            except Exception:
                texts.append("")
        full = "\n".join(texts).strip()
        if len(full) < 20:
            raise ValueError("PDF khÃ´ng cÃ³ lá»›p chá»¯ (cÃ³ thá»ƒ lÃ  file scan). Báº£n Ä‘áº§u chÆ°a há»— trá»£ OCR â€” hÃ£y dÃ¹ng file DOCX/PDF text.")
        return full
    raise ValueError("Äá»‹nh dáº¡ng chÆ°a há»— trá»£. HÃ£y dÃ¹ng .docx, .pdf (cÃ³ text) hoáº·c .txt.")
