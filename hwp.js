// 살핌 — 예전 한글(HWP 5.x) 파일을 브라우저 안에서 읽는 작은 리더
// 외부 라이브러리 없이 OLE(복합 문서) 구조를 풀고 본문 문단의 글자만 뽑습니다.
// 문서는 이 파일 안에서만 처리되며 어디로도 전송되지 않습니다.

export class HwpError extends Error {
  constructor(code, msg) { super(msg || code); this.code = code; }
}

// ── OLE 복합 문서(CFB) ──
function parseCfb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  if (buf.length < 512 || sig.some((b, i) => buf[i] !== b)) throw new HwpError('notcfb', 'HWP 5.x 형식이 아니에요');
  const u32 = (o) => dv.getUint32(o, true);
  const shift = dv.getUint16(0x1E, true), ssz = 1 << shift;
  const mssz = 1 << dv.getUint16(0x20, true);
  const nFat = u32(0x2C), dirStart = u32(0x30), cutoff = u32(0x38);
  const miniFatStart = u32(0x3C), difatStart = u32(0x44);
  const off = (sid) => (sid + 1) * ssz;
  const END = 0xFFFFFFFE, FREE = 0xFFFFFFFF;

  // FAT 섹터 목록(DIFAT)
  const fatSids = [];
  for (let i = 0; i < 109 && fatSids.length < nFat; i++) { const s = u32(0x4C + i * 4); if (s !== FREE) fatSids.push(s); }
  let d = difatStart, guard = 0;
  while (d !== END && d !== FREE && fatSids.length < nFat && guard++ < 10000) {
    const per = ssz / 4 - 1;
    for (let i = 0; i < per && fatSids.length < nFat; i++) { const s = u32(off(d) + i * 4); if (s !== FREE) fatSids.push(s); }
    d = u32(off(d) + per * 4);
  }
  const fat = new Uint32Array(fatSids.length * (ssz / 4));
  fatSids.forEach((s, k) => { for (let i = 0; i < ssz / 4; i++) fat[k * (ssz / 4) + i] = u32(off(s) + i * 4); });

  const chain = (start, table) => {
    const out = []; let s = start, n = 0;
    while (s !== END && s !== FREE && s < table.length && n++ < 1e6) { out.push(s); s = table[s]; }
    return out;
  };
  const readBig = (start, size) => {
    const out = new Uint8Array(size); let p = 0;
    for (const s of chain(start, fat)) {
      const o = off(s); const n = Math.min(ssz, size - p);
      if (n <= 0) break;
      out.set(buf.subarray(o, o + n), p); p += n;
    }
    return out;
  };

  // 디렉터리
  const dirRaw = (() => { const c = chain(dirStart, fat); const b = new Uint8Array(c.length * ssz); c.forEach((s, i) => b.set(buf.subarray(off(s), off(s) + ssz), i * ssz)); return b; })();
  const ddv = new DataView(dirRaw.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dirRaw.length; o += 128) {
    const nl = ddv.getUint16(o + 64, true);
    let name = '';
    for (let i = 0; i < Math.max(0, nl / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(o + i * 2, true));
    entries.push({ name, type: dirRaw[o + 66], left: ddv.getUint32(o + 68, true), right: ddv.getUint32(o + 72, true),
      child: ddv.getUint32(o + 76, true), start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true) });
  }
  const root = entries[0];
  const miniStream = root ? readBig(root.start, root.size) : new Uint8Array(0);
  const miniFat = (() => {
    if (miniFatStart === END || miniFatStart === FREE) return new Uint32Array(0);
    const raw = readBig(miniFatStart, chain(miniFatStart, fat).length * ssz);
    return new Uint32Array(raw.buffer, 0, raw.length / 4);
  })();
  const readMini = (start, size) => {
    const out = new Uint8Array(size); let p = 0;
    for (const s of chain(start, miniFat)) {
      const n = Math.min(mssz, size - p); if (n <= 0) break;
      out.set(miniStream.subarray(s * mssz, s * mssz + n), p); p += n;
    }
    return out;
  };

  // 경로 → 항목
  const paths = new Map();
  const walk = (id, prefix, depth) => {
    if (id === FREE || id >= entries.length || depth > 64) return;
    const e = entries[id];
    walk(e.left, prefix, depth + 1);
    walk(e.right, prefix, depth + 1);
    const p = prefix ? prefix + '/' + e.name : e.name;
    paths.set(p, e);
    if (e.type === 1) walk(e.child, p, depth + 1);
  };
  if (root) walk(root.child, '', 0);

  return {
    names: [...paths.keys()],
    read(path) {
      const e = paths.get(path);
      if (!e || e.type !== 2) return null;
      return e.size < cutoff ? readMini(e.start, e.size) : readBig(e.start, e.size);
    }
  };
}

// ── 압축 풀기(raw deflate) — 브라우저 내장 기능 사용 ──
async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') throw new HwpError('noinflate', '이 브라우저는 압축 풀기를 지원하지 않아요');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── 문단 글자 뽑기 ──
const PARA_TEXT = 0x43; // HWPTAG_BEGIN(0x10) + 51

function paraText(rec) {
  let s = '';
  const n = rec.length >> 1;
  for (let i = 0; i < n; i++) {
    const c = rec[i * 2] | (rec[i * 2 + 1] << 8);
    if (c >= 32) { s += String.fromCharCode(c); continue; }
    if (c === 9) { s += ' '; i += 7; continue; }            // 탭(인라인 컨트롤, 8칸)
    if (c === 10 || c === 13) { s += ' '; continue; }        // 줄바꿈·문단 끝
    if (c === 24) { s += '-'; continue; }                    // 하이픈
    if (c === 30 || c === 31) { s += ' '; continue; }        // 묶음·고정폭 빈칸
    if (c === 0 || (c >= 25 && c <= 29)) continue;           // 1칸짜리 문자 컨트롤
    i += 7;                                                  // 그 밖의 컨트롤은 8칸(표·그림·각주 등 — 내용은 별도 문단으로 나옴)
  }
  return s;
}

function sectionParas(data, out) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  while (p + 4 <= data.length) {
    const h = dv.getUint32(p, true); p += 4;
    const tag = h & 0x3FF;
    let size = (h >>> 20) & 0xFFF;
    if (size === 0xFFF) { if (p + 4 > data.length) break; size = dv.getUint32(p, true); p += 4; }
    if (p + size > data.length) break;
    if (tag === PARA_TEXT) {
      const t = paraText(data.subarray(p, p + size));
      if (t.trim()) out.push(t);
    }
    p += size;
  }
}

// HWP 파일(Uint8Array) → 문단 문자열 배열
export async function hwpParagraphs(buf) {
  const cfb = parseCfb(buf);
  const head = cfb.read('FileHeader');
  if (!head || head.length < 40) throw new HwpError('notcfb', 'HWP 파일 머리가 없어요');
  const sig = new TextDecoder('ascii').decode(head.subarray(0, 17));
  if (sig !== 'HWP Document File') throw new HwpError('notcfb', 'HWP 문서가 아니에요');
  const flags = new DataView(head.buffer, head.byteOffset).getUint32(36, true);
  if (flags & 2) throw new HwpError('password', '암호가 걸린 문서예요');
  if (flags & 4) throw new HwpError('distribution', '배포용 문서예요');
  const compressed = !!(flags & 1);
  const secs = cfb.names.filter((n) => /^BodyText\/Section\d+$/.test(n))
    .sort((a, b) => +a.match(/\d+$/)[0] - +b.match(/\d+$/)[0]);
  if (!secs.length) throw new HwpError('empty', '본문을 찾지 못했어요');
  const paras = [];
  for (const s of secs) {
    let d = cfb.read(s);
    if (!d) continue;
    if (compressed) d = await inflateRaw(d);
    sectionParas(d, paras);
  }
  return paras;
}
