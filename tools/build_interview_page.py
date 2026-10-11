#!/usr/bin/env python3
"""Build Interview-prep.html from Interview-prep.md.

The Markdown file is the source; edit it, then run:

    python3 tools/build_interview_page.py
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "Interview-prep.md"
OUTPUT = ROOT / "Interview-prep.html"
REPO_URL = "https://github.com/svasudev79/parkspotz/blob/main/"

CSS = """
:root {
  --bg:#f7f8fa; --surface:#ffffff; --text:#1b2330; --muted:#5b6676; --line:#dde2ea;
  --accent:#0f7a5a; --accent-soft:#e6f4ee; --code:#eef1f5; --answer:#f3f7ff; --answer-line:#3b6fd4;
  --node:#ffffff; --node-line:#9aa6b6; --ext:#fff7e6; --ext-line:#d9a441;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:#12161c; --surface:#1a2029; --text:#e6eaf0; --muted:#9aa5b5; --line:#2c3441;
    --accent:#4fd1a5; --accent-soft:#17352c; --code:#232a35; --answer:#18233a; --answer-line:#7aa2f7;
    --node:#1f2733; --node-line:#5b6676; --ext:#33290f; --ext-line:#c9983a;
  }
}
* { box-sizing:border-box; }
html { scroll-behavior:smooth; scroll-padding-top:16px; }
body { margin:0; background:var(--bg); color:var(--text);
  font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; }
.layout { max-width:1180px; margin:0 auto; padding:0 16px 80px; display:grid; gap:40px;
  grid-template-columns:minmax(0,1fr); }
header.top { padding:40px 0 8px; }
header.top h1 { font-size:34px; line-height:1.2; margin:0 0 10px; letter-spacing:-.01em; }
header.top p { margin:6px 0; color:var(--muted); max-width:70ch; }
nav.toc { font-size:14px; }
nav.toc h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 8px; }
nav.toc ol { list-style:none; margin:0; padding:0; display:grid; gap:2px; }
nav.toc a { display:block; padding:5px 10px; border-radius:6px; color:var(--text); text-decoration:none; }
nav.toc a:hover { background:var(--accent-soft); color:var(--accent); }
main { min-width:0; }
main > section { background:var(--surface); border:1px solid var(--line); border-radius:14px;
  padding:8px 28px 24px; margin:0 0 20px; }
h2 { font-size:24px; line-height:1.3; margin:22px 0 10px; letter-spacing:-.01em; }
h3 { font-size:18px; line-height:1.4; margin:30px 0 8px; padding-top:18px; border-top:1px solid var(--line); }
h2 + h3, .tablewrap + h3:first-of-type { border-top:0; padding-top:0; }
p { margin:10px 0; max-width:74ch; }
ul, ol { margin:10px 0; padding-left:24px; max-width:74ch; }
li { margin:4px 0; }
li > ul { margin:4px 0; }
a { color:var(--accent); }
strong { font-weight:650; }
code { background:var(--code); border-radius:5px; padding:1px 6px;
  font:13.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; overflow-wrap:anywhere; }
pre { background:var(--code); border-radius:10px; padding:12px 14px; overflow-x:auto; margin:10px 0; }
pre code { background:none; padding:0; overflow-wrap:normal; }
blockquote { margin:12px 0; padding:4px 18px; background:var(--answer);
  border-left:4px solid var(--answer-line); border-radius:0 10px 10px 0; }
blockquote p { max-width:72ch; }
.tablewrap { overflow-x:auto; margin:12px 0; }
table { border-collapse:collapse; width:100%; font-size:15px; }
th, td { border-bottom:1px solid var(--line); padding:9px 12px; text-align:left; vertical-align:top; }
th { font-size:12.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
tr:last-child td { border-bottom:0; }
ul.checklist { list-style:none; padding-left:0; }
ul.checklist li { margin:6px 0; }
ul.checklist label { display:flex; gap:10px; align-items:flex-start; cursor:pointer; }
ul.checklist input { width:18px; height:18px; margin-top:4px; accent-color:var(--accent); flex:none; }
ul.checklist input:checked + span { color:var(--muted); text-decoration:line-through; }
figure.diagram { margin:14px 0; overflow-x:auto; }
figure.diagram svg { display:block; min-width:640px; width:100%; height:auto; }
.d-node { fill:var(--node); stroke:var(--node-line); stroke-width:1.5; }
.d-ext { fill:var(--ext); stroke:var(--ext-line); stroke-width:1.5; }
.d-title { fill:var(--text); font:600 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.d-sub { fill:var(--muted); font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.d-label { fill:var(--muted); font:11.5px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.d-line { stroke:var(--node-line); stroke-width:1.6; fill:none; }
.d-dash { stroke-dasharray:5 4; }
.d-head { fill:var(--node-line); }
footer { color:var(--muted); font-size:13px; margin-top:24px; }
@media (min-width:980px) {
  .layout { grid-template-columns:230px minmax(0,1fr); }
  header.top { grid-column:1 / -1; }
  nav.toc { position:sticky; top:20px; align-self:start; max-height:calc(100vh - 40px); overflow:auto; }
}
@media (max-width:640px) {
  header.top h1 { font-size:27px; }
  main > section { padding:4px 16px 18px; border-radius:12px; }
  h2 { font-size:21px; }
}
@media print {
  body { background:#fff; }
  nav.toc { display:none; }
  .layout { display:block; }
  main > section { border:0; padding:0; break-inside:auto; }
  blockquote { break-inside:avoid; }
}
"""

# The architecture diagram, drawn by hand so the page needs no scripts to show it.
DIAGRAM = """
<figure class="diagram" role="img" aria-label="Architecture: the browser talks to the Next.js website on Vercel, which forwards API calls to the Express API on Google Cloud Run. The API uses Postgres on Neon, a Cloud Storage bucket for entry photos, and Razorpay. The browser also talks directly to Razorpay checkout and Google Maps.">
<svg viewBox="0 0 900 380" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path class="d-head" d="M0 0 L10 5 L0 10 z"/>
    </marker>
  </defs>
  <!-- main path -->
  <rect class="d-node" x="20" y="150" width="150" height="70" rx="10"/>
  <text class="d-title" x="95" y="180" text-anchor="middle">Browser</text>
  <text class="d-sub" x="95" y="200" text-anchor="middle">desktop or phone</text>

  <rect class="d-node" x="250" y="150" width="170" height="70" rx="10"/>
  <text class="d-title" x="335" y="180" text-anchor="middle">Next.js website</text>
  <text class="d-sub" x="335" y="200" text-anchor="middle">Vercel</text>

  <rect class="d-node" x="500" y="150" width="170" height="70" rx="10"/>
  <text class="d-title" x="585" y="180" text-anchor="middle">Express API</text>
  <text class="d-sub" x="585" y="200" text-anchor="middle">Google Cloud Run</text>

  <rect class="d-node" x="740" y="60" width="140" height="64" rx="10"/>
  <text class="d-title" x="810" y="88" text-anchor="middle">Postgres</text>
  <text class="d-sub" x="810" y="107" text-anchor="middle">Neon</text>

  <rect class="d-node" x="740" y="153" width="140" height="64" rx="10"/>
  <text class="d-title" x="810" y="181" text-anchor="middle">Entry photos</text>
  <text class="d-sub" x="810" y="200" text-anchor="middle">Cloud Storage bucket</text>

  <rect class="d-ext" x="500" y="296" width="170" height="60" rx="10"/>
  <text class="d-title" x="585" y="322" text-anchor="middle">Razorpay</text>
  <text class="d-sub" x="585" y="341" text-anchor="middle">payments</text>

  <rect class="d-ext" x="250" y="22" width="170" height="60" rx="10"/>
  <text class="d-title" x="335" y="48" text-anchor="middle">Google Maps</text>
  <text class="d-sub" x="335" y="67" text-anchor="middle">map and place search</text>

  <!-- solid arrows -->
  <path class="d-line" d="M170 185 H248" marker-end="url(#arrow)"/>
  <text class="d-label" x="209" y="176" text-anchor="middle">pages, /api/*</text>
  <path class="d-line" d="M420 185 H498" marker-end="url(#arrow)"/>
  <text class="d-label" x="459" y="176" text-anchor="middle">forwards /api/*</text>
  <path class="d-line" d="M670 170 C705 170 705 92 738 92" marker-end="url(#arrow)"/>
  <path class="d-line" d="M670 185 H738" marker-end="url(#arrow)"/>
  <path class="d-line" d="M585 220 V294" marker-end="url(#arrow)"/>
  <text class="d-label" x="593" y="254">create order,</text>
  <text class="d-label" x="593" y="269">verify signature</text>

  <!-- dashed arrows: browser to third parties -->
  <path class="d-line d-dash" d="M95 220 C95 326 300 326 498 326" marker-end="url(#arrow)"/>
  <text class="d-label" x="250" y="316" text-anchor="middle">checkout popup</text>
  <path class="d-line d-dash" d="M95 150 C95 52 170 52 248 52" marker-end="url(#arrow)"/>
  <text class="d-label" x="150" y="44" text-anchor="middle">map, suggestions</text>
</svg>
</figure>
"""

SCRIPT = """
// Remember ticked checklist items in this browser.
document.querySelectorAll('ul.checklist input').forEach(function (box, i) {
  var key = 'parkspotz-prep-' + i;
  try { box.checked = localStorage.getItem(key) === '1'; } catch (e) {}
  box.addEventListener('change', function () {
    try { localStorage.setItem(key, box.checked ? '1' : '0'); } catch (e) {}
  });
});
"""


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def inline(text):
    """Inline Markdown: code, links, bold, italic."""
    parts = re.split(r"(`[^`\n]+`)", html.escape(text, quote=False))
    for i, part in enumerate(parts):
        if i % 2:
            parts[i] = f"<code>{part[1:-1]}</code>"
            continue

        def link(match):
            label, target = match.group(1), match.group(2)
            if not re.match(r"(https?:|#|mailto:)", target):
                target = REPO_URL + target  # files in the repository
            return f'<a href="{target}">{label}</a>'

        part = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, part)
        part = re.sub(r"(?<![\w/\">])(https?://[^\s<]+[^\s<.,;:)])", r'<a href="\1">\1</a>', part)
        part = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", part)
        part = re.sub(r"(?<![*\w])\*([^*\n]+?)\*(?![*\w])", r"<em>\1</em>", part)
        parts[i] = part
    return "".join(parts)


LIST_ITEM = re.compile(r"^(\s*)([-*]|\d+\.)\s+(.*)$")


def render_list(lines):
    """Nested bullet/numbered lists, with `- [ ]` items as a checklist."""
    out, stack = [], []  # stack of (indent, tag)
    for line in lines:
        match = LIST_ITEM.match(line)
        if not match:  # continuation of the previous item
            out.append(" " + inline(line.strip()))
            continue
        indent, marker, text = len(match.group(1)), match.group(2), match.group(3)
        tag = "ul" if marker in "-*" else "ol"
        check = re.match(r"\[( |x)\]\s+(.*)", text)
        while stack and indent < stack[-1][0]:
            out.append(f"</li></{stack.pop()[1]}>")
        if not stack or indent > stack[-1][0]:
            cls = ' class="checklist"' if check else ""
            out.append(f"<{tag}{cls}>")
            stack.append((indent, tag))
        else:
            out.append("</li>")
        if check:
            ticked = " checked" if check.group(1) == "x" else ""
            out.append(f'<li><label><input type="checkbox"{ticked}><span>{inline(check.group(2))}</span></label>')
        else:
            out.append(f"<li>{inline(text)}")
    while stack:
        out.append(f"</li></{stack.pop()[1]}>")
    return "".join(out)


def render_blocks(lines):
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            lang = line[3:].strip()
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1
            out.append(DIAGRAM if lang == "mermaid" else f"<pre><code>{html.escape(chr(10).join(block))}</code></pre>")
        elif match := re.match(r"(#{3,4})\s+(.*)", line):
            level = len(match.group(1))
            out.append(f'<h{level} id="{slug(match.group(2))}">{inline(match.group(2))}</h{level}>')
            i += 1
        elif line.startswith(">"):
            paragraphs, current = [], []
            while i < len(lines) and lines[i].startswith(">"):
                text = lines[i][1:].strip()
                if text:
                    current.append(text)
                elif current:
                    paragraphs.append(current)
                    current = []
                i += 1
            if current:
                paragraphs.append(current)
            body = "".join(f"<p>{inline(' '.join(p))}</p>" for p in paragraphs)
            out.append(f"<blockquote>{body}</blockquote>")
        elif line.startswith("|") and i + 1 < len(lines) and re.match(r"\|[\s:|-]+\|?\s*$", lines[i + 1]):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head = "".join(f"<th>{inline(c)}</th>" for c in rows[0])
            body = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[2:])
            out.append(f'<div class="tablewrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>')
        elif LIST_ITEM.match(line):
            block = []
            while i < len(lines) and lines[i].strip() and (LIST_ITEM.match(lines[i]) or lines[i].startswith(" ")):
                block.append(lines[i])
                i += 1
            out.append(render_list(block))
        elif line.strip() in ("---", "***"):
            i += 1
        elif line.strip():
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(```|#{2,4}\s|>|\||\s*([-*]|\d+\.)\s|---$)", lines[i]):
                para.append(lines[i].strip())
                i += 1
            if not para:
                para, i = [line.strip()], i + 1
            out.append(f"<p>{inline(' '.join(para))}</p>")
        else:
            i += 1
    return "\n".join(out)


def main():
    lines = SOURCE.read_text(encoding="utf-8").split("\n")
    title = next(l[2:].strip() for l in lines if l.startswith("# "))

    # Split into the intro (before the first "## ") and one section per "## ".
    intro, sections, current = [], [], None
    for line in lines:
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            current = (line[3:].strip(), [])
            sections.append(current)
        elif current is None:
            intro.append(line)
        else:
            current[1].append(line)

    toc = "".join(f'<li><a href="#{slug(name)}">{html.escape(name)}</a></li>' for name, _ in sections)
    body = "\n".join(
        f'<section id="{slug(name)}"><h2>{inline(name)}</h2>\n{render_blocks(content)}\n</section>'
        for name, content in sections
    )
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="Study guide for discussing the ParkSpotZ parking app in an interview.">
<style>{CSS}</style>
</head>
<body>
<div class="layout">
<header class="top">
<h1>{html.escape(title)}</h1>
{render_blocks(intro)}
</header>
<nav class="toc" aria-label="Contents"><h2>Contents</h2><ol>{toc}</ol></nav>
<main>
{body}
<footer>Built from <a href="{REPO_URL}Interview-prep.md">Interview-prep.md</a> by <code>tools/build_interview_page.py</code>.</footer>
</main>
</div>
<script>{SCRIPT}</script>
</body>
</html>
"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(sections)} sections)")


if __name__ == "__main__":
    main()
