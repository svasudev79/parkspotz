#!/usr/bin/env python3
"""Export this project's Claude Code chat history to chat-history.html.

Reads every session transcript Claude Code has saved for this folder and writes
one self-contained HTML page. Run it again at any time to refresh the page:

    python3 tools/export_chat.py
"""
import html
import json
import re
from datetime import datetime
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
TRANSCRIPTS = Path.home() / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(PROJECT))
OUTPUT = PROJECT / "chat-history.html"

CSS = """
:root { --bg:#f6f7f9; --card:#fff; --text:#1c2026; --muted:#667085; --line:#dfe3e8;
        --user:#e8f0fe; --code:#f0f2f5; --accent:#2f5fd0; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#14171c; --card:#1c2027; --text:#e4e7ec; --muted:#98a2b3; --line:#2e343d;
          --user:#1f2c47; --code:#252a33; --accent:#8ab0ff; }
}
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text);
       font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
main { max-width:860px; margin:0 auto; padding:24px 16px 64px; }
h1 { font-size:24px; margin:0 0 4px; }
.sub { color:var(--muted); margin:0 0 24px; }
.session { margin:32px 0 12px; padding-bottom:6px; border-bottom:2px solid var(--line); font-size:18px; }
.msg { background:var(--card); border:1px solid var(--line); border-radius:10px;
       padding:12px 16px; margin:12px 0; overflow-wrap:anywhere; }
.msg.user { background:var(--user); }
.who { font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
       color:var(--muted); margin-bottom:4px; }
.who time { font-weight:400; text-transform:none; letter-spacing:0; margin-left:8px; }
.msg h2, .msg h3, .msg h4 { margin:16px 0 6px; font-size:16px; }
.msg p { margin:8px 0; }
.msg ul, .msg ol { margin:8px 0; padding-left:24px; }
a { color:var(--accent); }
code { background:var(--code); border-radius:4px; padding:1px 5px;
       font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
pre { background:var(--code); border-radius:8px; padding:10px 12px; overflow-x:auto; margin:8px 0; }
pre code { background:none; padding:0; }
.tablewrap { overflow-x:auto; }
table { border-collapse:collapse; margin:8px 0; }
th, td { border:1px solid var(--line); padding:5px 10px; text-align:left; vertical-align:top; }
details.tool { margin:6px 0 6px 16px; color:var(--muted); font-size:13px; }
details.tool summary { cursor:pointer; }
details.tool pre { max-height:320px; overflow:auto; color:var(--text); }
"""


def inline(text):
    """Render inline markdown (code, links, bold) on already-escaped text."""
    parts = re.split(r"(`[^`\n]+`)", html.escape(text, quote=False))
    for i, part in enumerate(parts):
        if i % 2:
            parts[i] = f"<code>{part[1:-1]}</code>"
        else:
            part = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', part)
            parts[i] = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", part)
    return "".join(parts)


def markdown(text):
    """Small markdown renderer covering what appears in the chat."""
    out, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith("```"):
            block = []
            i += 1
            while i < len(lines) and not lines[i].lstrip().startswith("```"):
                block.append(lines[i])
                i += 1
            out.append(f"<pre><code>{html.escape(chr(10).join(block))}</code></pre>")
        elif m := re.match(r"(#{1,4})\s+(.*)", line):
            level = min(len(m.group(1)) + 1, 4)
            out.append(f"<h{level}>{inline(m.group(2))}</h{level}>")
        elif line.startswith("|") and i + 1 < len(lines) and re.match(r"\|[\s:|-]+\|?\s*$", lines[i + 1]):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head = "".join(f"<th>{inline(c)}</th>" for c in rows[0])
            body = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[2:])
            out.append(f'<div class="tablewrap"><table><tr>{head}</tr>{body}</table></div>')
            continue
        elif m := re.match(r"\s*([-*]|\d+\.)\s+", line):
            tag = "ul" if m.group(1) in "-*" else "ol"
            items = []
            while i < len(lines) and (im := re.match(r"\s*([-*]|\d+\.)\s+(.*)", lines[i])):
                items.append(f"<li>{inline(im.group(2))}</li>")
                i += 1
            out.append(f"<{tag}>{''.join(items)}</{tag}>")
            continue
        elif line.strip():
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"\s*(```|#{1,4}\s|\||[-*]\s|\d+\.\s)", lines[i]):
                para.append(lines[i])
                i += 1
            if not para:
                para, i = [line], i + 1
            out.append(f"<p>{inline(' '.join(para))}</p>")
            continue
        i += 1
    return "\n".join(out)


def local_time(stamp):
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone().strftime("%d %b %Y, %H:%M")
    except (AttributeError, ValueError):
        return ""


def result_text(content):
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict))
    return content or ""


def tool_label(block):
    args = block.get("input") or {}
    detail = args.get("description") or args.get("file_path") or args.get("query") or ""
    return f"{block.get('name', 'Tool')}: {detail}" if detail else block.get("name", "Tool")


def render_session(path):
    """Return (first timestamp, title, html) for one transcript file."""
    title, first, parts, results, entries = "", "", [], {}, []
    for raw in path.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if entry.get("type") == "custom-title":
            title = entry.get("customTitle") or title
        if entry.get("type") not in ("user", "assistant") or entry.get("isSidechain") or entry.get("isMeta"):
            continue
        content = entry.get("message", {}).get("content")
        if isinstance(content, list):
            for block in content:
                if block.get("type") == "tool_result":
                    results[block.get("tool_use_id")] = result_text(block.get("content"))
        entries.append((entry, content))

    for entry, content in entries:
        when = local_time(entry.get("timestamp"))
        first = first or entry.get("timestamp", "")
        if entry["type"] == "user":
            if isinstance(content, str) and content.strip() and not content.startswith("<"):
                parts.append(f'<div class="msg user"><div class="who">You<time>{when}</time></div>{markdown(content)}</div>')
            continue
        for block in content or []:
            if block.get("type") == "text" and block.get("text", "").strip():
                parts.append(f'<div class="msg"><div class="who">Claude<time>{when}</time></div>{markdown(block["text"])}</div>')
            elif block.get("type") == "tool_use":
                args = block.get("input") or {}
                ran = args.get("command") or ""
                output = results.get(block.get("id"), "")
                body = (f"<pre><code>{html.escape(ran)}</code></pre>" if ran else "") + \
                       (f"<pre><code>{html.escape(output)}</code></pre>" if output else "")
                parts.append(f'<details class="tool"><summary>{html.escape(tool_label(block))}</summary>{body}</details>')
    return first, title or "Untitled session", "\n".join(parts)


def main():
    sessions = sorted(s for s in map(render_session, TRANSCRIPTS.glob("*.jsonl")) if s[2])
    body = "\n".join(
        f'<h2 class="session">{html.escape(title)} <small class="sub">started {local_time(first)}</small></h2>\n{content}'
        for first, title, content in sessions
    )
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ParkSpotZ chat history</title><style>{CSS}</style></head>
<body><main>
<h1>ParkSpotZ chat history</h1>
<p class="sub">{len(sessions)} session(s) &middot; exported {datetime.now().strftime("%d %b %Y, %H:%M")}</p>
{body}
</main></body></html>
"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(sessions)} session(s))")


if __name__ == "__main__":
    main()
