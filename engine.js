// 살핌 분석 엔진 — 브라우저와 Node(테스트) 양쪽에서 동작
// 문서는 이 파일 안에서만 처리되며 어디로도 전송되지 않습니다.

const HANGUL = /[가-힣]/;

// 한글 글자 사이에 공백이 끼어도 잡히도록 패턴을 느슨하게 만든다 ("민 원인" 같은 PDF 추출 대비)
export function flexPattern(pat) {
  // 1) 문자 클래스·이스케이프 밖의 한글 위치를 표시
  const isH = new Array(pat.length).fill(false);
  let inClass = false;
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === ']') { inClass = false; continue; }
    if (!inClass && HANGUL.test(c)) isH[i] = true;
  }
  // 2) 세 글자 이상 이어진 한글 덩어리 안에서만 공백 허용 (두 글자 단어가 띄어쓰기를 넘어 잘못 잡히는 것 방지)
  let out = '';
  for (let i = 0; i < pat.length; i++) {
    out += pat[i];
    if (isH[i] && isH[i + 1]) {
      let a = i; while (a > 0 && isH[a - 1]) a--;
      let b = i + 1; while (b + 1 < pat.length && isH[b + 1]) b++;
      if (b - a + 1 >= 3) out += '[ \\t]?';
    }
  }
  return out;
}

function decodeXml(s) {
  return s.replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

const clean = (s) => s.replace(/[ 　]/g, ' ').replace(/\s+/g, ' ').trim();

// 긴 덩어리를 문장·항목 단위로 자른다
export function segment(text) {
  const t = clean(text);
  if (!t) return [];
  const parts = t
    .replace(/([다요음함임됨][.!?])\s+/g, '$1\u0001')
    .replace(/([.!?])\s+(?=[가-힣A-Z○●◦•▪■□◆◇※\-–①-⑳(\d])/g, '$1\u0001')
    .replace(/\s(?=[○●◦•▪■□◆◇※]\s?)/g, '\u0001')
    .replace(/\s(?=[①-⑳])/g, '\u0001')
    .replace(/\s(?=\d{1,2}[.)]\s)/g, '\u0001')
    .split('\u0001');
  const out = [];
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    if (s.length <= 400) { out.push(s); continue; }
    for (let i = 0; i < s.length; i += 300) out.push(s.slice(i, i + 320)); // 아주 긴 표 덩어리는 겹치게 자름
  }
  return out;
}

// ── 문서 읽기 ──
export async function readPdf(data, pdfjsLib, opts = {}, onProgress = () => {}) {
  const task = pdfjsLib.getDocument({ data, cMapUrl: opts.cMapUrl, cMapPacked: true, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  const units = [];
  let chars = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let buf = '';
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      buf += it.str;
      if (it.hasEOL) buf += ' ';
    }
    chars += buf.replace(/\s/g, '').length;
    for (const s of segment(buf)) units.push({ page: p, loc: p + '쪽', text: s });
    page.cleanup();
    onProgress(p, doc.numPages);
  }
  const pages = doc.numPages;
  try { await task.destroy(); } catch (e) {}
  return { units, pages, kind: 'PDF', scanned: chars / Math.max(pages, 1) < 25 };
}

async function readZipXml(data, JSZip, filter, tokenRe, breakTag) {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files).filter(filter).sort((a, b) => {
    const na = +(a.match(/(\d+)\.xml$/) || [0, 0])[1], nb = +(b.match(/(\d+)\.xml$/) || [0, 0])[1];
    return na - nb;
  });
  const paras = [];
  for (const n of names) {
    const xml = await zip.file(n).async('string');
    let cur = '';
    let m;
    tokenRe.lastIndex = 0;
    while ((m = tokenRe.exec(xml))) {
      if (m[0].startsWith(breakTag)) { if (cur.trim()) paras.push(cur); cur = ''; }
      else if (m[1] !== undefined) cur += decodeXml(m[1]);
      else cur += ' ';
    }
    if (cur.trim()) paras.push(cur);
  }
  return paras;
}

export async function readHwpx(data, JSZip) {
  const paras = await readZipXml(data, JSZip, (n) => /^Contents\/section\d+\.xml$/i.test(n),
    /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>|<\/hp:p>|<hp:tab\b[^>]*\/>/g, '</hp:p>');
  return toParaUnits(paras, 'HWPX');
}

export async function readDocx(data, JSZip) {
  const paras = await readZipXml(data, JSZip, (n) => n === 'word/document.xml',
    /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<\/w:p>|<w:tab\/>/g, '</w:p>');
  return toParaUnits(paras, 'DOCX');
}

export function readText(text) {
  return toParaUnits(text.split(/\n+/), '붙여넣은 글');
}

function toParaUnits(paras, kind) {
  const units = [];
  let n = 0;
  for (const p of paras) {
    const segs = segment(p);
    if (!segs.length) continue;
    n++;
    for (const s of segs) units.push({ page: n, loc: n + '번째 문단', text: s });
  }
  return { units, pages: n, kind, scanned: false };
}

// ── 분석 ──
function compileTerms(C, seats) {
  const on = new Set([...seats, 'common']);
  return C.terms.filter((t) => t.pattern && on.has(t.seat)).map((t) => ({ ...t, re: new RegExp(flexPattern(t.pattern), 'g'), reqRe: t.require ? new RegExp(flexPattern(t.require)) : null }));
}

const AUTO_KEEP = [
  { id: '저출산', re: /저출산[ \t]?고령[ \t]?사회/ },
];

function snippet(text, start, end, room = 70) {
  const a = Math.max(0, start - room), b = Math.min(text.length, end + room);
  return { before: (a > 0 ? '…' : '') + text.slice(a, start), hit: text.slice(start, end), after: text.slice(end, b) + (b < text.length ? '…' : '') };
}

export function analyze(doc, C, seats) {
  const terms = compileTerms(C, seats);
  const groupsMap = new Map();
  doc.units.forEach((u, ui) => {
    for (const t of terms) {
      if (t.reqRe && !t.reqRe.test(u.text)) continue;
      t.re.lastIndex = 0;
      let m;
      while ((m = t.re.exec(u.text))) {
        if (!m[0]) { t.re.lastIndex++; continue; }
        const tail = u.text.slice(m.index, m.index + 20);
        if (AUTO_KEEP.some((k) => t.term.startsWith(k.id) && k.re.test(tail))) continue;
        if (!groupsMap.has(t.id)) groupsMap.set(t.id, { term: t, hits: [] });
        groupsMap.get(t.id).hits.push({ unit: ui, loc: u.loc, page: u.page, ...snippet(u.text, m.index, m.index + m[0].length) });
      }
    }
  });
  const order = { a: 0, b: 1, c: 2 };
  const findings = [...groupsMap.values()].sort((x, y) => order[x.term.lv] - order[y.term.lv] || x.hits[0].unit - y.hits[0].unit);

  const on = new Set(seats);
  const groups = C.groups.filter((g) => on.has(g.seat)).map((g) => ({ ...g, kwRe: new RegExp(flexPattern(g.kw)), cueRe: new RegExp(flexPattern(g.cues)) }));
  const readings = [];
  doc.units.forEach((u, ui) => {
    const hits = [];
    for (const g of groups) {
      const k = g.kwRe.exec(u.text);
      if (!k) continue;
      let c = null, m;
      const cre = new RegExp(g.cueRe.source, 'g');
      while ((m = cre.exec(u.text))) {
        if (!m[0]) { cre.lastIndex++; continue; }
        const overlap = m.index < k.index + k[0].length && k.index < m.index + m[0].length;
        if (!overlap) { c = m; break; }
      }
      if (!c) continue;
      hits.push({ g, k, c });
    }
    if (!hits.length) return;
    const h = hits[0];
    const s = Math.min(h.k.index, h.c.index), e = Math.max(h.k.index + h.k[0].length, h.c.index + h.c[0].length);
    readings.push({
      unit: ui, loc: u.loc, page: u.page,
      text: u.text.length > 260 ? snippet(u.text, s, e, 90) : null,
      full: u.text,
      marks: hits.flatMap((x) => [x.k[0], x.c[0]]),
      seats: [...new Set(hits.map((x) => x.g.seat))],
      questions: hits.map((x) => ({ q: x.g.q, basis: x.g.basis }))
        .filter((v, i, a) => a.findIndex((w) => w.q === v.q) === i)
    });
  });
  return { findings, readings };
}
