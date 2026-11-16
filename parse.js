const namedEntities = {
  AElig: "Æ", Dcaron: "Ď", HilbertSpace: "ℋ", DifferentialD: "ⅆ",
  ClockwiseContourIntegral: "∲", ngE: "≧̸", nbsp: " ", amp: "&",
  copy: "©", frac34: "¾", ouml: "ö", auml: "ä", hellip: "…",
  mdash: "—", reg: "®", quot: '"', lt: "<", gt: ">"
};
const entityPattern = /&(?:#([0-9]{1,7}|[xX][0-9A-Fa-f]{1,6})|([A-Za-z][A-Za-z0-9]+));/g;
const punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

function decodeEntity(s) {
  return s.replace(/&#(\d{1,7}|[xX][a-fA-F0-9]{1,6});/g, (whole, digits) => {
    const hex = digits[0] === "x" || digits[0] === "X";
    const n = Number.parseInt(hex ? digits.slice(1) : digits, hex ? 16 : 10);
    if (!n || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) {
      const replacements = { 0: 0xfffd, 128: 0x20ac, 130: 0x201a, 131: 0x192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x2c6, 137: 0x2030, 138: 0x160, 139: 0x2039, 140: 0x152, 142: 0x17d, 145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x2dc, 153: 0x2122, 154: 0x161, 155: 0x203a, 156: 0x153, 158: 0x17e, 159: 0x178 };
      return String.fromCodePoint(replacements[n] ?? 0xfffd);
    }
    return n === 38 ? "&amp;" : String.fromCodePoint(n);
  });
}
function escapeHtml(s, encode = false) {
  return s.replace(encode ? /[&<>"']/g : /[<>"']|&(?!(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);)/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function normalize(markdown) {
  return markdown.replace(/\r\n?|\u0000|﻿/g, c => c === "\u0000" ? "�" : c === "﻿" ? "" : "\n");
}
function expandLeadingTabs(line) {
  let i = 0, column = 0, prefix = "";
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    if (line[i] === "\t") { const count = 4 - column % 4; prefix += " ".repeat(count); column += count; }
    else { prefix += " "; column++; }
    i++;
  }
  return prefix + line.slice(i);
}
function refKey(s) { return decodeEntity(s).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1").trim().replace(/[\t\n ]+/g, " ").toLowerCase(); }
function normalizeDestination(s) {
  try { return encodeURI(decodeEntity(s)).replace(/%25/g, "%"); }
  catch { return null; }
}
function balancedEnd(s, at, open, close) {
  let depth = 0;
  for (let i = at; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  return -1;
}
function inline(source, refs, depth = 0) {
  if (!source || depth > 24) return escapeHtml(source || "");
  let out = "", i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    let m;
    if (source[i] === "\\" && i + 1 < source.length) {
      if (source[i + 1] === "\n") { out += "<br>"; i += 2; continue; }
      if (punctuation.test(source[i + 1])) { out += escapeHtml(source[i + 1]); i += 2; continue; }
    }
    if (source[i] === "\n") { out += "\n"; i++; continue; }
    if ((m = /^ {2,}\n/.exec(rest))) { out += "<br>\n"; i += m[0].length; continue; }
    if (source[i] === "`") {
      m = /^(`+)/.exec(rest);
      const ticks = m[0], end = source.indexOf(ticks, i + ticks.length);
      if (end >= 0) {
        let value = source.slice(i + ticks.length, end).replace(/\n/g, " ");
        if (value.length >= 2 && value[0] === " " && value.at(-1) === " " && /[^ ]/.test(value)) value = value.slice(1, -1);
        out += `<code>${escapeHtml(value, true)}</code>`; i = end + ticks.length; continue;
      }
    }
    if ((source[i] === "[" || (source[i] === "!" && source[i + 1] === "["))) {
      const image = source[i] === "!", open = i + (image ? 1 : 0), labelEnd = balancedEnd(source, open, "[", "]");
      if (labelEnd >= 0) {
        let href = null, title = "", consumed = labelEnd + 1;
        if (source[consumed] === "(") {
          const end = balancedEnd(source, consumed, "(", ")");
          if (end >= 0) {
            let inside = source.slice(consumed + 1, end).trim(), hm = /^(?:<([^<>]*)>|([^\s]*))?/.exec(inside);
            href = (hm[1] ?? hm[2] ?? "").replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
            let tail = inside.slice(hm[0].length).trim();
            if (tail.length >= 2 && /^(?:"[\s\S]*"|'[\s\S]*'|\([\s\S]*\))$/.test(tail)) title = tail.slice(1, -1).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
            consumed = end + 1;
          }
        } else {
          let rm = /^\s*\[([^\]]*)\]/.exec(source.slice(consumed));
          const key = refKey(rm && rm[1] ? rm[1] : source.slice(open + 1, labelEnd));
          if (refs.has(key)) { ({ href, title } = refs.get(key)); consumed += rm ? rm[0].length : 0; }
          else if (source[consumed] !== "[") {
            const key2 = refKey(source.slice(open + 1, labelEnd));
            if (refs.has(key2)) { ({ href, title } = refs.get(key2)); }
          }
        }
        if (href !== null) {
          const text = source.slice(open + 1, labelEnd);
          const destination = normalizeDestination(href);
          if (image) out += `<img src="${escapeHtml(destination)}" alt="${escapeHtml(text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1"), true)}"${title ? ` title="${escapeHtml(title.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1"))}"` : ""}>`;
          else out += `<a href="${escapeHtml(destination)}"${title ? ` title="${escapeHtml(title.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1"))}"` : ""}>${inline(text, refs, depth + 1)}</a>`;
          i = consumed; continue;
        }
      }
    }
    if (source[i] === "<") {
      m = /^<((?:https?:\/\/|ftp:\/\/|mailto:)[^ <>]*|[^ <>@]+@[^ <>@]+)>/i.exec(rest);
      if (m) {
        const value = m[1], mail = !value.includes(":");
        out += `<a href="${escapeHtml(mail ? `mailto:${value}` : value)}">${escapeHtml(value)}</a>`; i += m[0].length; continue;
      }
      m = /^<!--[\s\S]*?(?:-->|$)|^<\/?[A-Za-z][^>]*>|^<\?[\s\S]*?\?>|^<![A-Z][\s\S]*?>/.exec(rest);
      if (m) { out += m[0]; i += m[0].length; continue; }
    }
    if (/\w/.test(source[i]) && (i === 0 || !/[\w@]/.test(source[i - 1]))) {
      m = /^(https?:\/\/|ftp:\/\/|www\.)[^\s<>]+/i.exec(rest);
      if (m) {
        let value = m[0];
        while (/[.,!?;:*_~]$/.test(value)) value = value.slice(0, -1);
        while (value.endsWith(")") && (value.match(/\)/g) || []).length > (value.match(/\(/g) || []).length) value = value.slice(0, -1);
        if (value.length) { const href = /^www\./i.test(value) ? `http://${value}` : value; out += `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>`; i += value.length; continue; }
      }
      m = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/.exec(rest);
      if (m) { out += `<a href="mailto:${escapeHtml(m[0])}">${escapeHtml(m[0])}</a>`; i += m[0].length; continue; }
    }
    if (source[i] === "&" && /^&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);/.test(rest)) { out += "&"; i++; continue; }
    if (source[i] === "&") { out += "&amp;"; i++; continue; }
    if ((m = /^&#(?:\d{1,7}|[xX][a-fA-F0-9]{1,6});/.exec(rest))) {
      out += escapeHtml(decodeEntity(m[0])); i += m[0].length; continue;
    }
    if ((source[i] === "*" || source[i] === "_") && source[i + 1] === source[i]) {
      const marker = source[i] + source[i], close = findDelimiter(source, marker, i + 2);
      if (close > i + 2 && source[i + 2] !== " " && source[close - 1] !== " ") {
        out += `<strong>${inline(source.slice(i + 2, close), refs, depth + 1)}</strong>`; i = close + 2; continue;
      }
    }
    if ((source[i] === "*" || source[i] === "_") && source[i + 1] !== " ") {
      const close = findDelimiter(source, source[i], i + 1);
      if (close > i + 1 && source[close - 1] !== " ") {
        out += `<em>${inline(source.slice(i + 1, close), refs, depth + 1)}</em>`; i = close + 1; continue;
      }
    }
    if (source.startsWith("~~", i)) {
      const close = findDelimiter(source, "~~", i + 2);
      if (close > i + 2 && source[i + 2] !== " " && source[close - 1] !== " ") {
        out += `<del>${inline(source.slice(i + 2, close), refs, depth + 1)}</del>`; i = close + 2; continue;
      }
    }
    if (source[i] === "\\" && i + 1 < source.length) { out += "\\"; i++; continue; }
    if (source[i] === "<" || source[i] === ">" || source[i] === '"' || source[i] === "'") { out += escapeHtml(source[i]); i++; continue; }
    let j = i + 1;
    while (j < source.length && !"\\\n`[!<>&*_~\"'>".includes(source[j]) && !(source[j] === " " && /^ +\n/.test(source.slice(j)))) j++;
    out += escapeHtml(source.slice(i, j)); i = j;
  }
  return out;
}
function findDelimiter(s, marker, from) {
  for (let i = from; i <= s.length - marker.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s.startsWith(marker, i) && s[i - 1] !== " " && s[i - 1] !== "\n" && s[i + marker.length] !== " ") return i;
  }
  return -1;
}

function parse(markdown, inheritedRefs = null) {
  const source = normalize(markdown);
  const refs = inheritedRefs ?? new Map();
  let lines = source.split("\n").map(expandLeadingTabs);
  if (lines.at(-1) === "") lines.pop();
  const defs = [];
  for (let i = 0; i < lines.length; i++) {
    const candidate = lines[i];
    const m = /^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>\n]*)>|([^\s>]+))?[ \t]*(?:(?:\n[ \t]*)?("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\([\s\S]*?\)))?[ \t]*$/.exec(candidate);
    if (m && (m[2] !== undefined || m[3] !== undefined)) {
      const key = refKey(m[1]);
      if (!refs.has(key)) refs.set(key, { href: m[2] ?? m[3] ?? "", title: (m[4] ?? "").slice(1, -1).replace(/\\([\\"'])/g, "$1") });
      defs.push(i);
    }
  }
  const removed = new Set(defs);
  const line = i => lines[i] ?? "";
  const blank = s => /^[ \t]*$/.test(s);
  const startsBlock = (s, i) => {
    const prefix = /^ {0,3}/.exec(s)[0].length;
    const text = s.slice(prefix);
    return /^(?:#{1,6}(?:\s|$)|>|(?:[-+*]|\d{1,9}[.)])[ \t]+[^ \t\n]|`{3,}|~{3,}|(?:[-*_][ \t]*){3,})/.test(text) ||
      /^<(?:!--|\?|![A-Z]|\/?[A-Za-z])/i.test(text) ||
      (i + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(line(i + 1)));
  };
  let out = "", i = 0;
  const render = (start, end) => parse(lines.slice(start, end).join("\n"));
  while (i < lines.length) {
    if (removed.has(i) || blank(line(i))) { i++; continue; }
    let s = line(i), m;
    if ((m = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(s))) {
      let text = m[2].replace(/[ \t]+#+[ \t]*$/, "").replace(/^#+[ \t]*$/, "").trim();
      out += `<h${m[1].length}>${inline(text, refs)}</h${m[1].length}>\n`; i++; continue;
    }
    if ((m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(s))) {
      const fence = m[1], ch = fence[0], rawInfo = m[2].trim(), info = rawInfo.split(/[ \t]+/, 1)[0].replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
      let body = [], j = i + 1;
      while (j < lines.length && !new RegExp(`^ {0,3}${ch === "`" ? "`" : "~"}{${fence.length},}[ \t]*$`).test(line(j))) body.push(line(j++));
      if (j < lines.length) j++;
      const code = body.length ? body.join("\n") + "\n" : "";
      out += `<pre><code${info ? ` class="language-${escapeHtml(info)}"` : ""}>${escapeHtml(code, true)}</code></pre>\n`; i = j; continue;
    }
    if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s)) { out += "<hr>\n"; i++; continue; }
    if (/^ {0,3}>/.test(s)) {
      let q = [], j = i;
      while (j < lines.length && /^ {0,3}>/.test(line(j))) { q.push(line(j).replace(/^ {0,3}> ?/, "")); j++; }
      if (q.length) { out += `<blockquote>\n${parse(q.join("\n"), refs)}</blockquote>\n`; i = j; continue; }
    }
    if (/^(?: {4,}|\t)/.test(s)) {
      let code = [], j = i;
      while (j < lines.length) {
        if (/^ {4,}/.test(line(j))) { code.push(line(j).slice(4)); j++; continue; }
        if (blank(line(j))) { code.push(""); j++; continue; }
        break;
      }
      while (code.length && code.at(-1) === "") code.pop();
      if (code.length) { out += `<pre><code>${escapeHtml(code.join("\n") + "\n", true)}</code></pre>\n`; i = j; continue; }
    }
    if (/^ {0,3}</.test(s) && isHtmlBlock(s)) {
      const tag = /^ {0,3}<([A-Za-z]+)/.exec(s)?.[1]?.toLowerCase();
      let j = i + 1, block = [s];
      if (tag && /^(?:script|pre|style|textarea)$/.test(tag)) {
        while (j < lines.length) { block.push(line(j)); if (new RegExp(`</${tag}\\s*>`, "i").test(line(j++))) break; }
      } else if (/^ {0,3}<!--/.test(s)) {
        if (!s.includes("-->")) while (j < lines.length) { block.push(line(j)); if (line(j++).includes("-->")) break; }
      } else if (/^ {0,3}<\?/.test(s)) {
        while (j < lines.length) { block.push(line(j)); if (line(j++).includes("?>")) break; }
      } else if (/^ {0,3}<!\[CDATA\[/i.test(s)) {
        while (j < lines.length) { block.push(line(j)); if (line(j++).includes("]]>") ) break; }
      } else if (/^ {0,3}<![A-Z]/.test(s)) {
        while (j < lines.length) { block.push(line(j)); if (line(j++).includes(">")) break; }
      } else if (!/^(?:<\/?(?:div|section|article|details|table|script|style|pre|textarea|ul|ol|li|blockquote|p|h[1-6]|form|fieldset|figure|summary|html|head|body|header|footer|nav|main|aside|address|dl|dt|dd|hr|iframe|center|menu|legend|meta|link|base|caption|colgroup|thead|tbody|tfoot|tr|td|th)(?:[\s/>]|$))/i.test(s)) {
        while (j < lines.length && !isBlank(line(j))) block.push(line(j++));
      }
      out += block.join("\n");
      if (j < lines.length || /\n$/.test(source)) out += "\n";
      i = j; continue;
    }
    if (isListStart(s) && !/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s)) {
      const result = renderList(lines, i, refs, removed);
      out += result.html; i = result.next; continue;
    }
    if (i + 1 < lines.length && isTableDelimiter(line(i + 1))) {
      const result = renderTable(lines, i, refs);
      if (result) { out += result.html; i = result.next; continue; }
    }
    let j = i + 1;
    while (j < lines.length && !isBlank(line(j)) && !removed.has(j) && !startsBlock(line(j), j)) j++;
    if (j < lines.length && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line(j))) {
      const level = line(j).trim()[0] === "=" ? 1 : 2;
      out += `<h${level}>${inline(lines.slice(i, j).join("\n"), refs)}</h${level}>\n`; i = j + 1; continue;
    }
    const text = lines.slice(i, j).filter((_, k) => !removed.has(i + k)).join("\n");
    if (text) out += `<p>${inline(text, refs)}</p>\n`;
    i = Math.max(j, i + 1);
  }
  return out;
}
function isHtmlBlock(s) { return /^ {0,3}(?:<!--|<\?|<![A-Z]|<!\[CDATA\[|<\/?(?:address|article|aside|base|blockquote|body|caption|center|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|iframe|li|link|main|menu|nav|ol|p|pre|script|section|style|table|ul)(?:\s|\/?>))/i.test(s); }
function isBlank(s) { return /^[ \t]*$/.test(s); }
function renderLines(lines, refs) {
  let text = lines.join("\n").replace(/^ {0,3}> ?/gm, "");
  return parse(text);
}
function isListStart(s) { return /^ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]+[^ \t\n]|$)/.test(s); }
function renderList(lines, start, refs, removed) {
  const first = /^ {0,3}([-+*]|\d{1,9}[.)])(?:[ \t]+|$)/.exec(lines[start]);
  const ordered = /^\d/.test(first[1]), marker = first[1].at(-1), base = lines[start].search(/\S/), items = [];
  let i = start, loose = false;
  while (i < lines.length) {
    if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(lines[i])) break;
    const m = /^ {0,3}([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/.exec(lines[i]);
    if (!m || (/^\d/.test(m[1]) !== ordered) || (ordered ? m[1].at(-1) !== marker : m[1] !== first[1])) break;
    const markerIndent = lines[i].search(/\S/), contentIndent = m[1].length + (m[2]?.length ?? 0) + markerIndent;
    let item = [m[3] === undefined ? "" : m[3]], j = i + 1, hadBlank = false;
    while (j < lines.length) {
      if (isBlank(lines[j])) { if (j + 1 < lines.length && /^ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]+|$)/.test(lines[j + 1])) { hadBlank = true; j++; break; } if (j + 1 < lines.length && /^ {2,}/.test(lines[j + 1])) { item.push(""); hadBlank = true; j++; continue; } break; }
        const next = /^ {0,3}([-+*]|\d{1,9}[.)])(?:[ \t]+[^ \t\n]|$)/.exec(lines[j]);
      if (next && /^\d/.test(next[1]) === ordered && (ordered ? next[1].at(-1) === marker : next[1] === first[1])) break;
      if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(lines[j])) break;
      if (/^ {0,3}(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,})/.test(lines[j]) && !/^ {2,}/.test(lines[j])) break;
      if (lines[j].search(/\S/) < contentIndent && /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]/.test(lines[j])) break;
      item.push(lines[j].replace(new RegExp(`^ {1,${contentIndent}}`), "")); j++;
    }
    const task = /^\[([ xX])\][ \t]+/.exec(item[0]);
    if (task) item[0] = item[0].slice(task[0].length);
    items.push({ lines: item, task, blank: hadBlank }); loose ||= hadBlank; i = j;
    if (isBlank(lines[i])) i++;
    if (i >= lines.length) break;
  }
  const startNum = ordered && Number(first[1].slice(0, -1)) !== 1 ? ` start="${Number(first[1].slice(0, -1))}"` : "";
  let html = `<${ordered ? "ol" : "ul"}${startNum}>\n`;
  for (const item of items) {
    const body = parse(item.lines.join("\n"), refs).replace(/\n$/, "");
    const checkbox = item.task ? `<input${item.task[1].toLowerCase() === "x" ? " checked" : ""} disabled="" type="checkbox"> ` : "";
    let content = body || "";
    if (item.task) content = content.replace(/<p>/, "<p>");
    if (loose) html += `<li>${checkbox}${content}\n</li>\n`;
    else {
      content = content.replace(/^<p>([\s\S]*)<\/p>$/, "$1");
      content = content.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>$/, "<pre><code>$1</code></pre>\n");
      html += `<li>${checkbox}${content}</li>\n`;
    }
  }
  html += `</${ordered ? "ol" : "ul"}>\n`;
  return { html, next: Math.max(i, start + 1) };
}
function splitTableRow(s) {
  let x = s.trim().replace(/^\|/, "").replace(/\|$/, ""), cells = [], cur = "", escaped = false;
  for (const ch of x) { if (ch === "|" && !escaped) { cells.push(cur.trim()); cur = ""; } else { cur += ch; escaped = ch === "\\" && !escaped; if (ch !== "\\") escaped = false; } }
  cells.push(cur.trim()); return cells;
}
function isTableDelimiter(s) { return /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(s); }
function renderTable(lines, start, refs) {
  const headings = splitTableRow(lines[start]), aligns = splitTableRow(lines[start + 1]);
  if (headings.length !== aligns.length || !aligns.every(x => /^:?-+:?$/.test(x))) return null;
  const alignment = aligns.map(x => x.startsWith(":") && x.endsWith(":") ? "center" : x.startsWith(":") ? "left" : x.endsWith(":") ? "right" : "");
  let j = start + 2, rows = [];
  while (j < lines.length && !isBlank(lines[j]) && lines[j].includes("|")) { rows.push(splitTableRow(lines[j])); j++; }
  const cell = (value, idx, head) => `<${head ? "th" : "td"}${alignment[idx] ? ` align="${alignment[idx]}"` : ""}>${inline(value.replace(/\\\|/g, "|"), refs)}</${head ? "th" : "td"}>`;
  let html = `<table>\n<thead>\n<tr>\n${headings.map((x, k) => cell(x, k, true)).join("\n")}\n</tr>\n</thead>\n`;
  if (rows.length) html += `<tbody>\n${rows.map(row => `<tr>\n${headings.map((_, k) => cell(row[k] ?? "", k, false)).join("\n")}\n</tr>`).join("\n")}\n</tbody>\n`;
  html += `</table>\n`;
  return { html, next: j };
}

export { parse };
