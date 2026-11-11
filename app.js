import { buildDocx } from './docx.js';
import { readPdf, ocrPdf, readHwpx, readDocx, readText, analyze } from './engine.js';

const C = window.SALPIM_CRITERIA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LV = { a: '꼭 살펴요', b: '살펴보면 좋아요', c: '알아두면 좋아요' };
const seatById = Object.fromEntries(C.seats.map((s) => [s.id, s]));
const srcName = (id) => C.sources[id] || id;

$$('[data-n="p"]').forEach((e) => (e.textContent = C.principleCount));
$$('[data-n="t"]').forEach((e) => (e.textContent = C.termCount));

// ───────── 화면 전환 ─────────
const views = ['home', 'busy', 'results', 'report', 'standards'];
function show(id) {
  views.forEach((v) => $('#' + v).classList.toggle('hidden', v !== id));
  $('#foot').classList.toggle('hidden', id === 'busy' || id === 'report');
  window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (!g) return;
  const to = g.dataset.go;
  if (to === 'home') { e.preventDefault(); show('home'); }
  if (to === 'standards') { e.preventDefault(); renderStandards(); show('standards'); }
  if (to === 'check') {
    if ($('#home').classList.contains('hidden')) { e.preventDefault(); show('home'); setTimeout(() => $('#check').scrollIntoView(), 30); }
  }
});

// ───────── 첫 화면: 사람이 바뀌는 제목 ─────────
const READERS = [
  { seat: '가정 밖 청소년', color: '#FFE375', no: '3-1', lv: 'b',
    who: '열여섯 살, 지금은 청소년쉼터에서 지내요.',
    parts: [['가출청소년', '가정 밖 청소년'], ['이 센터를 찾으면 보호자 연락처를 먼저 확인한다.']],
    voice: '“나는 도망친 게 아니라, 있을 곳이 없었던 건데.”',
    note: '‘가출’이라는 말은 집을 나온 이유를 개인의 잘못으로 그려요. 법률 용어도 ‘가정 밖 청소년’으로 바뀌었어요.',
    src: '청소년복지 지원법 개정(2021) · 국가인권위원회 권고(2017)' },
  { seat: '장애가 있는 동료', color: '#FFADAD', no: '3-2', lv: 'a',
    who: '휠체어를 타고 출근해요. 이번 캠프 운영을 맡았어요.',
    parts: [['장애를 앓고 있는', '장애가 있는'], [' 참가자는 '], ['일반인', '비장애인'], ['과 이동 동선을 분리한다.']],
    voice: '“나는 아픈 사람도, 따로 다녀야 하는 사람도 아닌데.”',
    note: '장애는 앓는 병이 아니에요. ‘일반인’과 나누면 장애인은 ‘일반적이지 않은 사람’이 돼요.',
    src: '개선이 필요한 공공언어 30선(2026) 6·7번 · 장애관련 올바른 용어 가이드라인' },
  { seat: '이주배경 학부모', color: '#96F1C6', no: '3-3', lv: 'c',
    who: '베트남에서 왔어요. 아이가 이번 캠프에 참가해요.',
    parts: [['다문화가정 아이', '이주배경 학생'], ['는 사전 적응반에 별도 편성한다.']],
    voice: '“우리 아이만 따로 이름을 붙여 부르네요. 같은 반 친구들과 뭐가 다를까요.”',
    note: '‘다문화’라는 이름이 아이를 따로 구분 짓는 말로 들릴 수 있어요. 교육부는 ‘이주배경 학생’이라는 말을 쓰고 있어요.',
    src: '교육부 이주배경학생 용어' },
  { seat: '한부모가정 청소년', color: '#FFC48C', no: '3-4', lv: 'a',
    who: '엄마와 둘이 살아요. 상담을 받아볼까 고민 중이에요.',
    parts: [['상담 유형은 학업·진로·대인관계·'], ['가정문제(한부모, 조손)', '가족관계'], ['로 구분한다.']],
    voice: '“우리 집이 ‘가정문제’ 칸에 있어요. 상담받으러 가면 나도 문제로 보일까요?”',
    note: '가족 형태는 문제의 종류가 아니에요. 단어가 아니라 분류 자체를 살펴야 하는 경우예요.',
    src: '혐오표현 대항 안내서(국가인권위원회) 11쪽 · 국립국어원 ‘결손가정→한부모가정’' }
];

let heroI = 0;
function heroTick() {
  const r = READERS[heroI % READERS.length];
  $('#heroSeat').innerHTML = `<span class="roll"><span class="sweep" style="background-image:linear-gradient(${r.color},${r.color})">${esc(r.seat)}</span>의</span>`;
  heroI++;
}
heroTick();
if (!reduced) setInterval(heroTick, 2800);

// ───────── 자리에 앉아보기 ─────────
let pick = 0, timers = [];
function renderWho() {
  $('#whoList').innerHTML = READERS.map((r, i) => `
    <button type="button" class="who" aria-pressed="${i === pick}" data-i="${i}">
      <b><i class="sq" style="background:${r.color}"></i>${esc(r.seat)}</b>
      <span>${esc(r.who)}</span>${i === pick && !reduced ? '<i class="prog"></i>' : ''}
    </button>`).join('');
}
function renderRead() {
  const r = READERS[pick];
  const sent = r.parts.map(([t, alt]) => alt
    ? `<span class="old" style="background-image:linear-gradient(${r.color},${r.color})">${esc(t)}</span><span class="new">${esc(alt)}</span>`
    : esc(t)).join('');
  $('#readPane').innerHTML = `
    <p class="lab">문장</p>
    <div><p class="meta">○○센터 이용자 응대 매뉴얼 · ${r.no}</p><p class="sent serif">${sent}</p></div>
    <p class="lab step s-voice">속마음</p>
    <p class="voice serif step s-voice" style="border-left-color:${r.color}">${esc(r.voice)}</p>
    <p class="lab step s-fix">살핌</p>
    <div class="step s-fix" style="display:flex;flex-direction:column;gap:8px">
      <p style="margin:0;font-size:13px;font-weight:700;color:#2E6B4F">${LV[r.lv]}</p>
      <p style="margin:0;font-size:17px;line-height:1.75">${esc(r.note)}</p>
    </div>
    <p class="lab step s-src">근거</p>
    <p class="step s-src" style="margin:0;font-size:14px;color:#5A5470">${esc(r.src)}</p>`;
}
function setPhase(p) {
  const el = $('#readPane');
  el.className = 'read ' + Array.from({ length: p }, (_, k) => 'p' + (k + 1)).join(' ');
}
function play(i) {
  timers.forEach(clearTimeout); timers = [];
  pick = i; renderWho(); renderRead();
  if (reduced) { setPhase(5); return; }
  setPhase(0);
  [[1, 700], [2, 1700], [3, 3500], [4, 4200], [5, 5000]].forEach(([p, t]) => timers.push(setTimeout(() => setPhase(p), t)));
  timers.push(setTimeout(() => play((i + 1) % READERS.length), 10500));
}
$('#whoList').addEventListener('click', (e) => { const b = e.target.closest('.who'); if (b) play(+b.dataset.i); });
play(0);

// ───────── 작은 말이, 사람을 그려요 ─────────
(function () {
  let started = false;
  const start = () => {
    if (started) return; started = true;
    $('#whyInner').classList.add('go');
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1600), e = 1 - Math.pow(1 - k, 3);
      $('#pct').textContent = (78.7 * e).toFixed(1);
      if (k < 1) requestAnimationFrame(step);
    };
    if (reduced) $('#pct').textContent = '78.7'; else requestAnimationFrame(step);
  };
  if (!('IntersectionObserver' in window)) return start();
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { start(); io.disconnect(); } }, { threshold: 0.2 });
  io.observe($('#why'));
})();

// ───────── 문서 넣기 ─────────
let mode = 'file', file = null;
const off = new Set();
function renderSeats() {
  $('#seatList').innerHTML = C.seats.map((s) => `
    <label><input type="checkbox" value="${s.id}" ${off.has(s.id) ? '' : 'checked'}><i class="sq" style="background:${s.color}"></i>${esc(s.label)}</label>`).join('');
  $('#selCount').textContent = `${C.seats.length - off.size}/${C.seats.length}`;
}
renderSeats();
$('#seatList').addEventListener('change', (e) => {
  const v = e.target.value; e.target.checked ? off.delete(v) : off.add(v);
  $('#selCount').textContent = `${C.seats.length - off.size}/${C.seats.length}`;
});
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  mode = t.dataset.mode;
  $$('.tab').forEach((x) => x.setAttribute('aria-selected', x === t));
  $('#drop').classList.toggle('hidden', mode !== 'file');
  $('#pasteBox').classList.toggle('hidden', mode !== 'paste');
  hideErr();
}));
function setFile(f) {
  file = f || null; hideErr();
  $('#dropTitle').textContent = f ? f.name : '파일을 여기에 놓거나, 눌러서 골라주세요';
  $('#dropTitle').classList.toggle('picked', !!f);
  $('#dropSub').textContent = f ? `${(f.size / 1024 / 1024).toFixed(1)}MB · 다른 파일을 고르려면 다시 눌러주세요` : 'PDF · 한글(HWPX) · 워드(DOCX)';
}
$('#docFile').addEventListener('change', (e) => setFile(e.target.files[0]));
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) setFile(f); });

function showErr(msg) { const el = $('#err'); el.innerHTML = msg; el.classList.remove('hidden'); }
function hideErr() { $('#err').classList.add('hidden'); }

let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
let ocrCancel = false, tess = null;
function loadTesseract() {
  if (tess) return tess;
  tess = new Promise((ok, no) => {
    if (window.Tesseract) return ok(window.Tesseract);
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    sc.onload = () => window.Tesseract ? ok(window.Tesseract) : no(new Error('no Tesseract'));
    sc.onerror = () => { tess = null; no(new Error('load failed')); };
    document.head.appendChild(sc);
  });
  return tess;
}
const BUSY_H = '문서를 살펴보고 있어요';
function busyTitle(h, note) {
  $('#busy h2').textContent = h || BUSY_H;
  const el = $('#busyNote'); el.textContent = note || ''; el.hidden = !note;
  $('#busyCancel').hidden = !h; $('#busyCancel').textContent = '그만두기';
}
document.addEventListener('click', (e) => { if (e.target.closest('#busyCancel')) { ocrCancel = true; e.target.textContent = '멈추는 중…'; } });
const busy = (t, k) => { $('#busyText').textContent = t; $('#busyBar').style.width = Math.round((k || 0) * 100) + '%'; };

let state = null;
$('#startBtn').addEventListener('click', async () => {
  hideErr();
  const seats = C.seats.map((s) => s.id).filter((id) => !off.has(id));
  if (!seats.length) return showErr('살펴볼 자리를 하나 이상 골라주세요.');
  let name, doc;
  try {
    if (mode === 'paste') {
      const text = $('#docText').value.trim();
      if (text.length < 10) return showErr('살펴볼 글을 붙여넣어 주세요.');
      name = '붙여넣은 글';
      show('busy'); busy('글을 읽는 중…', 0.5);
      doc = readText(text);
    } else {
      if (!file) return showErr('살펴볼 파일을 골라주세요.');
      name = file.name;
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (ext === 'hwp') return showErr('예전 한글 형식(HWP)은 아직 읽지 못해요. 한글에서 <b>다른 이름으로 저장 → HWPX</b>로 저장하거나, 내용을 복사해서 <b>글 붙여넣기</b>를 이용해 주세요.');
      if (!['pdf', 'hwpx', 'docx', 'txt'].includes(ext)) return showErr('PDF, 한글(HWPX), 워드(DOCX) 파일을 올려주세요.');
      show('busy'); busy('문서를 여는 중…', 0.02);
      const buf = new Uint8Array(await file.arrayBuffer());
      if (ext === 'pdf') {
        const lib = await loadPdfjs();
        const cMapUrl = new URL('./vendor/cmaps/', import.meta.url).href;
        doc = await readPdf(buf.slice(), lib, { cMapUrl }, (p, n) => busy(`${n}쪽 중 ${p}쪽을 읽는 중…`, p / n));
        if (doc.scanned) {
          busyTitle('이미지로 저장된 PDF예요', '이 PDF는 글자가 아니라 이미지로 저장되어 있어서, 글자로 다시 바꾸면서 살펴보고 있어요. 시간이 조금 걸릴 수 있어요. 글자를 바꾸는 일도 이 컴퓨터 안에서만 해요.');
          busy('글자 인식 도구를 준비하는 중… (처음 한 번은 1~2분 걸릴 수 있어요)', 0.01);
          let T;
          try { T = await loadTesseract(); } catch (e) {
            busyTitle(); show('home'); $('#check').scrollIntoView();
            return showErr('이미지 PDF를 글자로 바꾸는 도구를 불러오지 못했어요(인터넷 연결 필요). 한컴·어도비·스캔 앱의 <b>OCR(텍스트 인식)</b>으로 텍스트 PDF를 만든 뒤 다시 올려 주세요.');
          }
          ocrCancel = false;
          const t0 = Date.now();
          doc = await ocrPdf(buf.slice(), lib, T, { cMapUrl }, (p, n) => {
            const left = p > 1 ? Math.round((Date.now() - t0) / p * (n - p) / 1000) : null;
            busy(`${n}쪽 중 ${p}쪽을 글자로 바꿨어요${left != null ? ` · 남은 시간 약 ${left >= 90 ? Math.round(left / 60) + '분' : left + '초'}` : ''}`, p / n);
          }, () => ocrCancel);
          busyTitle();
          if (!doc) { show('home'); $('#check').scrollIntoView(); return; }
        }
      } else if (ext === 'hwpx') { busy('한글 문서를 읽는 중…', 0.5); doc = await readHwpx(buf, window.JSZip); }
      else if (ext === 'docx') { busy('워드 문서를 읽는 중…', 0.5); doc = await readDocx(buf, window.JSZip); }
      else { doc = readText(new TextDecoder().decode(buf)); }
    }
    if (doc.scanned || !doc.units.length) {
      show('home'); $('#check').scrollIntoView();
      return showErr(doc.ocr ? '이미지 PDF를 글자로 바꿔 봤지만 읽을 수 있는 글자가 거의 없었어요. 원본 파일(한글·워드)을 올리거나, OCR로 텍스트 PDF를 만든 뒤 다시 올려 주세요.' : '이 파일에서 글자를 읽지 못했어요. 원본 파일(한글·워드)을 올리거나, 내용을 복사해서 <b>글 붙여넣기</b>를 이용해 주세요.');
    }
    busy('표현을 살피는 중…', 1);
    const t0 = performance.now();
    const r = analyze(doc, C, seats);
    state = { name, doc, seats, at: new Date(), ms: Math.round(performance.now() - t0), findings: r.findings, readings: r.readings,
      fDec: {}, rDec: {}, ai: {}, aiRun: 'idle', aiDone: 0, aiTotal: 0, aiErr: '', tab: r.findings.length ? 'f' : 'r', filter: 'all' };
    renderResults(); show('results');
  } catch (err) {
    console.error(err);
    show('home'); $('#check').scrollIntoView();
    showErr('파일을 읽는 중에 문제가 생겼어요. 파일이 암호로 잠겨 있거나 손상되었을 수 있어요. 내용을 복사해서 <b>글 붙여넣기</b>로 다시 시도해 주세요.');
  }
});

// ───────── 결과 ─────────
const KEEP_REASONS = ['고유명칭(기관·법령·사업명)', '법령·지침을 그대로 인용', '맥락상 문제없음', '대체할 표현이 없음', '기타'];

function markText(text, marks) {
  let html = esc(text);
  [...new Set(marks)].sort((a, b) => b.length - a.length).forEach((m) => {
    const e = esc(m);
    html = html.split(e).join(`\u0000${e}\u0001`);
  });
  return html.replace(/\u0000/g, '<mark>').replace(/\u0001/g, '</mark>');
}

// ───────── 맥락 확인 (AI) ─────────
const AI_LAB = { fix: '고쳐 쓰는 게 좋아요', check: '한 번 더 읽어봐 주세요', ok: '맥락상 괜찮아 보여요' };
const AI_RANK = { fix: 0, check: 1, none: 2, ok: 3 };
const PER_TERM = 5;
function aiItems() {
  const out = [];
  state.findings.forEach((g, gi) => g.hits.slice(0, PER_TERM).forEach((h, hi) => out.push({
    id: `f${gi}_${hi}`, kind: 'term', text: h.before + h.hit + h.after, hit: h.hit, rule: g.term.reason, alt: /^\(/.test(g.term.alt || '') ? '' : (g.term.alt || '') })));
  state.readings.forEach((x, i) => out.push({
    id: `r${i}`, kind: 'reading', text: x.text ? x.text.before + x.text.hit + x.text.after : x.full,
    hit: x.text ? x.text.hit : (x.marks || []).join(', '), rule: x.questions.map((q) => q.q).join(' '), alt: '' }));
  return out.filter((x) => !state.ai[x.id]);
}
function groupAI(gi) {
  const g = state.findings[gi], vs = g.hits.slice(0, PER_TERM).map((_, hi) => state.ai[`f${gi}_${hi}`]).filter(Boolean);
  if (!vs.length) return { st: 'none', vs };
  const st = vs.some((v) => v.v === 'fix') ? 'fix' : vs.some((v) => v.v === 'check') ? 'check' : 'ok';
  return { st, vs };
}
function aiNote(v) {
  if (!v) return '';
  return `<div class="ai ai-${v.v}"><p class="ai-h"><i></i>${AI_LAB[v.v]}</p>${v.why ? `<p class="ai-why">${esc(v.why)}</p>` : ''}${v.sug ? `<p class="ai-sug serif">${esc(v.sug)}</p>` : ''}</div>`;
}
async function runAI() {
  const items = aiItems(); if (!items.length) return;
  Object.assign(state, { aiRun: 'run', aiDone: 0, aiTotal: items.length, aiErr: '' }); keepScroll(renderResults);
  const chunks = []; for (let i = 0; i < items.length; i += 6) chunks.push(items.slice(i, i + 6));
  let k = 0, fail = '';
  const worker = async () => {
    while (k < chunks.length && !fail) {
      const c = chunks[k++];
      try {
        const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 45000);
        const r = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: c }), signal: ac.signal });
        clearTimeout(tm);
        if (r.status === 404) { fail = 'nofn'; break; }
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { fail = d.error === 'no_key' ? 'nokey' : 'api'; state.aiCode = `${r.status}${d.error ? ' · ' + d.error : ''}${d.status ? ' ' + d.status : ''}${d.detail ? ' · ' + d.detail : ''}`; break; }
        d.results.forEach((x) => { state.ai[x.id] = x; });
      } catch (e) { fail = e.name === 'AbortError' ? 'slow' : 'net'; break; }
      state.aiDone += c.length; keepScroll(renderResults);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  state.aiRun = fail ? 'err' : 'done'; state.aiErr = fail; keepScroll(renderResults);
}
function aiPanel() {
  const s = state;
  if (s.aiRun === 'run') return `<div class="aip"><p><b>맥락까지 살펴보는 중이에요</b> · ${s.aiDone}/${s.aiTotal}문장</p><div class="aibar"><i style="width:${Math.round(100 * s.aiDone / Math.max(1, s.aiTotal))}%"></i></div></div>`;
  if (s.aiRun === 'done') {
    const vs = Object.values(s.ai), n = (v) => vs.filter((x) => x.v === v).length;
    return `<div class="aip done"><p><b>맥락까지 살펴봤어요.</b> 고쳐 쓰면 좋은 곳 ${n('fix')} · 한 번 더 읽어볼 곳 ${n('check')} · 맥락상 괜찮은 곳 ${n('ok')}. 괜찮아 보이는 항목은 아래로 내렸어요.</p><p class="note">AI 판단도 참고 의견이에요. 최종 판단은 읽는 분이 해 주세요.</p></div>`;
  }
  const err = { nofn: '이 주소에는 맥락 확인 기능이 설치되어 있지 않아요. 배포 안내의 ‘맥락 확인 켜기’를 참고해 주세요.', nokey: '맥락 확인용 API 키가 아직 설정되지 않았어요.', api: 'AI 응답에 문제가 생겼어요. 잠시 뒤 다시 눌러 주세요. 이미 살펴본 문장은 그대로 남아요.', net: '연결이 끊겼어요. 잠시 뒤 다시 눌러 주세요.', slow: 'AI 응답이 너무 오래 걸려요. 잠시 뒤 다시 눌러 주세요. 이미 살펴본 문장은 그대로 남아요.' }[s.aiErr];
  const code = s.aiErr === 'api' && s.aiCode ? ` <span class="cnt">(${esc(s.aiCode)})</span>` : '';
  return `<div class="aip"><div><p><b>단어만으로는 맥락을 다 알 수 없어요.</b> 찾은 문장만(문서 전체가 아니라) AI에게 보내, 정말 고칠 곳인지 한 번 더 살펴볼 수 있어요.</p>${err ? `<p class="ai-err">${err}${code}</p>` : ''}</div><button type="button" class="aibtn" data-act="ai">맥락까지 살펴보기</button></div>`;
}

function findingHTML(g, idx) {
  const t = g.term, h = g.hits[0], d = state.fDec[t.id] || {};
  const showAlt = t.alt && !/^\(/.test(t.alt);
  const inlineAlt = showAlt && !t.alt.includes(',');
  const reason = /[.!?다요음]$/.test(t.reason.trim()) ? t.reason.trim() : t.reason.trim() + '.';
  const more = g.hits.length > 1 ? `<details class="more"><summary>다른 ${g.hits.length - 1}곳도 보기</summary><ul>${g.hits.slice(1, 40).map((x) =>
    `<li><span class="cnt">${esc(x.loc)}</span> · ${esc(x.before)}<mark class="${t.lv}">${esc(x.hit)}</mark>${esc(x.after)}</li>`).join('')}${g.hits.length > 41 ? `<li class="cnt">외 ${g.hits.length - 41}곳</li>` : ''}</ul></details>` : '';
  const ga = groupAI(idx), aiFirst = state.ai[`f${idx}_0`];
  const aiOthers = ga.vs.length > 1 ? (() => { const fx = g.hits.slice(1, PER_TERM).map((h, hi) => [h, state.ai[`f${idx}_${hi + 1}`]]).filter(([, v]) => v && v.v !== 'ok');
    return fx.length ? `<details class="more"><summary>다른 곳 중 살펴볼 ${fx.length}곳</summary><ul>${fx.map(([h, v]) => `<li><span class="cnt">${esc(h.loc)}</span> · ${esc(h.before)}<mark class="${t.lv}">${esc(h.hit)}</mark>${esc(h.after)}${aiNote(v)}</li>`).join('')}</ul></details>` : ''; })() : '';
  return `<article class="item ${ga.st === 'ok' ? 'cleared' : ''}" data-f="${esc(t.id)}">
    <p class="lab">표현</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="it-title"><span class="lv lv-${t.lv}">${LV[t.lv]}</span><b>${esc(h.hit)}</b>${showAlt ? `<span class="cnt">→ ${esc(t.alt)}</span>` : ''}<span class="cnt">${g.hits.length}곳</span></div>
      <p class="ctx serif"><span class="loc">${esc(h.loc)}</span>${esc(h.before)}<mark class="${t.lv}">${esc(h.hit)}</mark>${inlineAlt ? `<span class="alt">${esc(t.alt)}</span>` : ''}${esc(h.after)}</p>
      ${more}
    </div>
    <p class="lab">살핌</p>
    <div style="display:flex;flex-direction:column;gap:6px">
      <p class="why-t">${esc(reason)}${showAlt ? ` ‘${esc(t.alt)}’(으)로 써 보면 어떨까요?` : ''}</p>
      ${t.note ? `<p class="note">살펴볼 점 · ${esc(t.note)}</p>` : ''}
    </div>
    <p class="lab">근거</p>
    <p class="src">${esc(srcName(t.src))} ${esc(t.page)} <button type="button" class="rep-mini" data-report data-kind="잘못 잡았어요 (오탐)" data-ctx="${esc(`[${t.term}] ${h.loc} · ${h.before}${h.hit}${h.after}`)}">이 판단이 이상해요</button></p>
    ${aiFirst ? `<p class="lab">맥락</p><div style="display:flex;flex-direction:column;gap:10px">${aiNote(aiFirst)}${aiOthers}</div>` : ''}
  </article>`;
}

function readingHTML(x, idx) {
  const d = state.rDec[idx] || {};
  const body = x.text ? `${esc(x.text.before)}<mark>${esc(x.text.hit)}</mark>${esc(x.text.after)}` : markText(x.full, x.marks);
  const qs = x.questions.map((q) => {
    const p = C.principles[q.basis];
    return `<p class="q">${esc(q.q)}</p>${p ? `<p class="src">근거 · ${esc(p.title)} — ${esc(p.src)} ${esc(p.page)}</p>` : ''}`;
  }).join('');
  const av = state.ai[`r${idx}`];
  return `<article class="item ${av && av.v === 'ok' ? 'cleared' : ''}" data-r="${idx}">
    <p class="lab">문장</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="it-title">${x.seats.map((s) => `<span class="cnt" style="display:inline-flex;align-items:center;gap:6px"><i class="sq" style="background:${seatById[s].color}"></i>${esc(seatById[s].label)}</span>`).join('')}</div>
      <p class="ctx serif"><span class="loc">${esc(x.loc)}</span>${body}</p>
    </div>
    <p class="lab">질문</p>
    <div style="display:flex;flex-direction:column;gap:6px">${qs}<p class="src"><button type="button" class="rep-mini" data-report data-kind="잘못 잡았어요 (오탐)" data-ctx="${esc(`[함께 읽어볼 문장] ${x.loc || ''} · ${x.text ? x.text.before + x.text.hit + x.text.after : x.full}`)}">이 판단이 이상해요</button></p></div>
    ${av ? `<p class="lab">맥락</p>${aiNote(av)}` : ''}
  </article>`;
}

function counts() {
  const fd = Object.values(state.fDec).filter((d) => d.v).length;
  const rd = Object.values(state.rDec).filter((d) => d.v).length;
  return { total: state.findings.length + state.readings.length, done: fd + rd };
}

function renderResults() {
  const s = state;
  const nHits = s.findings.reduce((a, g) => a + g.hits.length, 0);
  const seatsUsed = new Set([...s.findings.map((g) => g.term.seat), ...s.readings.flatMap((r) => r.seats)]);
  const fl = s.filter;
  const fItems = s.findings.map((g, i) => [g, i]).filter(([g]) => fl === 'all' || g.term.seat === fl).sort((a, b) => AI_RANK[groupAI(a[1]).st] - AI_RANK[groupAI(b[1]).st]);
  const rItems = s.readings.map((x, i) => [x, i]).filter(([x]) => fl === 'all' || x.seats.includes(fl)).sort((a, b) => AI_RANK[(s.ai[`r${a[1]}`] || { v: 'none' }).v] - AI_RANK[(s.ai[`r${b[1]}`] || { v: 'none' }).v]);
  const nothing = !s.findings.length && !s.readings.length;
  const head = nothing
    ? `<h2>살펴볼 표현을 찾지 못했어요</h2><p class="sub">고른 자리에서 기준에 걸리는 표현과 민감한 대상을 다루는 문장이 보이지 않았어요. 다만 살핌은 정해진 기준으로만 살피기 때문에, 표나 분류처럼 맥락으로 생기는 문제는 놓칠 수 있어요. 한 번 더 훑어봐 주세요.</p>`
    : `<h2>${s.findings.length ? `고쳐 쓰면 좋은 표현 ${s.findings.length}가지(${nHits}곳)` : ''}${s.findings.length && s.readings.length ? '와 ' : ''}${s.readings.length ? `함께 읽어볼 문장 ${s.readings.length}개` : ''}를 찾았어요</h2>
       ${s.doc.ocr ? '<p class="sub ocr-note">이미지로 저장된 PDF라 글자로 바꿔 읽었어요. 글자를 잘못 읽은 곳이 있으면 표현을 놓쳤을 수 있어요.</p>' : ''}
       <p class="sub">살핌은 원문을 바꾸지 않아요. 하나씩 읽어보고, 고칠 곳은 원본 문서에서 직접 고쳐 주세요. 맥락상 그대로 두는 게 맞는 표현도 있어요.</p>`;
  const filters = ['all', ...C.seats.map((x) => x.id).filter((id) => seatsUsed.has(id))];
  const c = counts();
  $('#results').innerHTML = `
    <div class="wrap res">
      <div class="res-head">
        <p class="file">${esc(s.name)}${s.name === s.doc.kind ? '' : ' · ' + esc(s.doc.kind)} · ${s.doc.kind === 'PDF' ? s.doc.pages + '쪽' : s.doc.pages + '개 문단'} · 살핀 자리 ${s.seats.length}곳</p>
        ${head}
        ${nothing ? '' : aiPanel()}
      </div>
      ${nothing ? '' : `
      <div class="rtabs" role="tablist">
        <button type="button" class="rtab" role="tab" data-tab="f" aria-selected="${s.tab === 'f'}">고쳐 쓰면 좋은 표현<em>${s.findings.length}</em></button>
        <button type="button" class="rtab" role="tab" data-tab="r" aria-selected="${s.tab === 'r'}">함께 읽어볼 문장<em>${s.readings.length}</em></button>
      </div>
      <p class="note" style="margin-top:-14px">${s.tab === 'f'
        ? '공식 지침에 대안이 나와 있는 표현이에요. 같은 표현은 한 번에 묶어 보여드려요.'
        : '민감한 대상을 다루면서 ‘문제·원인·분리’ 같은 말이 함께 쓰인 문장이에요. 틀렸다는 뜻이 아니라, 그 자리의 사람이 읽으면 어떨지 한 번 더 읽어봐 달라는 뜻이에요.'}</p>
      ${filters.length > 2 ? `<div class="filters" role="group" aria-label="자리별로 보기">${filters.map((f) => `<button type="button" data-filter="${f}" aria-pressed="${fl === f}">${f === 'all' ? '모두' : `<i class="sq" style="background:${seatById[f].color}"></i>${esc(seatById[f].label)}`}</button>`).join('')}</div>` : ''}
      <div class="items">
        ${s.tab === 'f'
          ? (fItems.length ? fItems.map(([g, i]) => findingHTML(g, i)).join('') : '<p class="empty">이 자리에서는 고쳐 쓸 표현을 찾지 못했어요.</p>')
          : (rItems.length ? rItems.map(([x, i]) => readingHTML(x, i)).join('') : '<p class="empty">이 자리에서 함께 읽어볼 문장은 없어요.</p>')}
      </div>`}
    </div>
    <div class="dock"><div class="wrap">
      <p id="dockTxt">${nothing ? '살펴본 결과를 검토 기록으로 남길 수 있어요.' : `살펴본 결과를 검토 기록으로 남길 수 있어요`}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="ghost" data-act="again">다른 문서 살펴보기</button>
        <button type="button" data-act="report">검토 기록 만들기 →</button>
      </div>
    </div></div>`;
}

$('#results').addEventListener('click', (e) => {
  const t = e.target;
  const tab = t.closest('[data-tab]'); if (tab) { state.tab = tab.dataset.tab; state.filter = 'all'; renderResults(); return; }
  const f = t.closest('[data-filter]'); if (f) { state.filter = f.dataset.filter; renderResults(); return; }
  const act = t.closest('[data-act]');
  if (act) {
    if (act.dataset.act === 'again') { show('home'); setTimeout(() => $('#check').scrollIntoView(), 30); }
    if (act.dataset.act === 'report') { renderReport(); show('report'); }
    if (act.dataset.act === 'ai' && state.aiRun !== 'run') runAI();
    return;
  }
  const fd = t.closest('[data-fd]');
  if (fd) {
    const id = fd.closest('[data-f]').dataset.f, cur = state.fDec[id] || {};
    state.fDec[id] = cur.v === fd.dataset.fd ? {} : { v: fd.dataset.fd, why: fd.dataset.fd === 'keep' ? (cur.why || KEEP_REASONS[0]) : undefined };
    keepScroll(renderResults); return;
  }
  const rd = t.closest('[data-rd]');
  if (rd) {
    const i = rd.closest('[data-r]').dataset.r, cur = state.rDec[i] || {};
    state.rDec[i] = { ...cur, v: cur.v === rd.dataset.rd ? undefined : rd.dataset.rd };
    keepScroll(renderResults);
  }
});
$('#results').addEventListener('change', (e) => {
  if (e.target.matches('[data-fr]')) state.fDec[e.target.closest('[data-f]').dataset.f].why = e.target.value;
});
$('#results').addEventListener('input', (e) => {
  if (e.target.matches('[data-rm]')) { const i = e.target.closest('[data-r]').dataset.r; state.rDec[i] = { ...(state.rDec[i] || {}), memo: e.target.value }; }
});
function keepScroll(fn) { const y = scrollY; fn(); scrollTo(0, y); }

// ───────── 검토 기록 ─────────
function fmt(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}. ${p(d.getHours())}:${p(d.getMinutes())}`; }
const REQ_DEFAULT = '살핌(문서 표현 점검 도구)으로 아래 문서를 살펴본 결과, 고쳐 쓰면 좋은 표현이 확인되어 알려드립니다. 다음 개정(수정) 때 반영을 검토해 주시고, 반영 여부를 표에 적어 회신해 주시기 바랍니다.';
function reportData() {
  const s = state, useAI = Object.keys(s.ai).length > 0;
  const req = s.req || (s.req = { to: '', from: '', due: '', msg: REQ_DEFAULT });
  const f = s.findings.map((g, gi) => ({ g, gi, st: groupAI(gi).st }));
  const r = s.readings.map((x, i) => ({ x, i, v: s.ai[`r${i}`] }));
  return {
    s, req, useAI,
    fMain: f.filter((o) => o.st !== 'ok'), fOk: f.filter((o) => o.st === 'ok'),
    rMain: r.filter((o) => !o.v || o.v.v !== 'ok'), rOk: r.filter((o) => o.v && o.v.v === 'ok'),
    locs: (g) => g.hits.map((h) => h.loc).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6).join(', ') + (new Set(g.hits.map((h) => h.loc)).size > 6 ? ' 외' : ''),
    ex: (g) => { const h = g.hits[0]; return (h.before + h.hit + h.after).trim(); },
    alt: (g) => /^\(/.test(g.term.alt || '') ? (g.term.alt || '').replace(/^\(|\)$/g, '') : (g.term.alt || '-'),
    rtext: (x) => (x.text ? x.text.before + x.text.hit + x.text.after : x.full).trim(),
    aiNoteF: (gi) => { const v = state.ai[`f${gi}_0`]; return v ? AI_LAB[v.v] + (v.why ? ' — ' + v.why : '') : ''; },
  };
}
function renderReport() {
  const D = reportData(), { s, req, useAI } = D;
  const fRows = D.fMain.map(({ g, gi }, n) => `<tr><td>${n + 1}</td><td><b>${esc(g.hits[0].hit)}</b><br><span class="mut">${esc(D.locs(g))}</span></td><td>${esc(D.ex(g))}</td><td>${esc(D.alt(g))}</td><td>${esc(g.term.reason)}${useAI && D.aiNoteF(gi) ? `<br><span class="mut">맥락 확인: ${esc(D.aiNoteF(gi))}</span>` : ''}</td><td class="fill"></td><td class="fill"></td></tr>`).join('');
  const rRows = D.rMain.map(({ x, v }, n) => `<tr><td>${n + 1}</td><td>${esc(x.loc)}</td><td>${esc(D.rtext(x))}</td><td>${esc(x.questions.map((q) => q.q).join(' '))}${v ? `<br><span class="mut">맥락 확인: ${esc(AI_LAB[v.v] + (v.why ? ' — ' + v.why : ''))}</span>` : ''}</td><td class="fill"></td><td class="fill"></td></tr>`).join('');
  const okList = [...D.fOk.map(({ g }) => `${g.hits[0].hit} (${D.locs(g)})`), ...D.rOk.map(({ x }) => `${x.loc} 문장`)];
  $('#report').innerHTML = `
    <div class="r-acts">
      <button type="button" class="btn" data-ract="back">← 결과로 돌아가기</button>
      <button type="button" class="btn" data-ract="print">인쇄 · PDF로 저장</button>
      <button type="button" class="btn" aria-pressed="true" data-ract="docx">워드(.docx)로 내려받기</button>
    </div>
    <p class="r-tip">빈칸을 채운 뒤 내려받으세요. 워드 파일은 한글에서 그대로 열리고, 한글에서 <b>다른 이름으로 저장 → HWP</b>로 바꿀 수 있어요.</p>
    <article class="paper">
      <p style="margin:0 0 4px;font-size:13px;color:#5A5470">살핌 검토 결과 · 반영 협조 요청</p>
      <h2>${esc(s.name)}</h2>
      <table class="kv">
        <tr><th><label for="rq-to">수신(소관 부서)</label></th><td><input type="text" id="rq-to" data-rq="to" value="${esc(req.to)}" placeholder="예) 청소년활동안전센터"></td></tr>
        <tr><th><label for="rq-from">요청 부서 · 담당자</label></th><td><input type="text" id="rq-from" data-rq="from" value="${esc(req.from)}" placeholder="예) 기획혁신부 홍길동 (내선 0000)"></td></tr>
        <tr><th><label for="rq-due">회신 기한</label></th><td><input type="text" id="rq-due" data-rq="due" value="${esc(req.due)}" placeholder="예) 2026. 11. 30.까지"></td></tr>
        <tr><th>살핀 일시 · 문서</th><td>${fmt(s.at)} · ${esc(s.doc.kind)} ${s.doc.kind === 'PDF' ? s.doc.pages + '쪽' : s.doc.pages + '개 문단'}${s.doc.ocr ? ' (이미지 PDF를 글자로 바꿔 읽음)' : ''}</td></tr>
        <tr><th>적용 기준</th><td>살핌 기준 ${esc(C.version)} · 표현 기준 ${C.termCount}개 · 판단 원칙 ${C.principleCount}개 · 살핀 자리: ${s.seats.map((id) => esc(seatById[id].label)).join(', ')}</td></tr>
      </table>
      <h3>요청 내용</h3>
      <textarea id="rq-msg" data-rq="msg" rows="3" class="rq-msg">${esc(req.msg)}</textarea>
      <h3>1. 고쳐 쓰면 좋은 표현 (${D.fMain.length}가지)</h3>
      ${D.fMain.length ? `<table class="rq"><thead><tr><th>번호</th><th>표현 · 위치</th><th>예시 문장</th><th>고쳐 쓸 말</th><th>근거</th><th>반영 여부</th><th>비고</th></tr></thead><tbody>${fRows}</tbody></table>` : '<p>없음</p>'}
      <h3>2. 함께 읽어볼 문장 (${D.rMain.length}개)</h3>
      ${D.rMain.length ? `<table class="rq"><thead><tr><th>번호</th><th>위치</th><th>문장</th><th>함께 생각해볼 질문</th><th>반영 여부</th><th>비고</th></tr></thead><tbody>${rRows}</tbody></table>` : '<p>없음</p>'}
      ${okList.length ? `<h3>참고 · 맥락상 괜찮다고 본 항목 (${okList.length})</h3><p class="mut">${esc(okList.join(' · '))}</p>` : ''}
      <h3>안내</h3>
      <p>살핌은 국가인권위원회, 국립국어원, 서울시 성평등 언어사전 등 공식 자료에 근거한 표현 기준으로 문서를 살핍니다. 결과는 참고 의견이며, 법령·사업의 고유 명칭처럼 그대로 두는 것이 맞는 경우도 있으니 소관 부서에서 판단해 주세요.</p>
      <p>${useAI ? `맥락 확인을 위해 살핌이 찾은 후보 문장 ${Object.keys(s.ai).length}개만 AI(Anthropic Claude)로 보내 판단을 받았습니다. 문서 전체는 전송되거나 저장되지 않았습니다.` : '이 문서는 검토하는 동안 이용자의 컴퓨터 밖으로 전송되거나 저장되지 않았습니다.'}</p>
      <p style="color:#5A5470">살핌 · 한국청소년활동진흥원 AX 실천공동체</p>
    </article>`;
}
$('#report').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-ract]'); if (!a) return;
  if (a.dataset.ract === 'back') { show('results'); }
  if (a.dataset.ract === 'print') window.print();
  if (a.dataset.ract === 'docx') {
    a.disabled = true; const t = a.textContent; a.textContent = '만드는 중…';
    try {
      const blob = await buildDocx(reportData(), window.JSZip);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `살핌_검토결과_${(state.name || '문서').replace(/\.[^.]+$/, '').slice(0, 40)}.docx`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) { console.error(err); alert('워드 파일을 만들지 못했어요. 인쇄 · PDF로 저장을 이용해 주세요.'); }
    a.disabled = false; a.textContent = t;
  }
});
$('#report').addEventListener('input', (e) => { const k = e.target.dataset.rq; if (k && state) { (state.req || (state.req = {}))[k] = e.target.value; } });

// ───────── 살피는 기준 ─────────
let stdDone = false;
function renderStandards() {
  if (stdDone) return; stdDone = true;
  const bySeat = C.seats.concat([{ id: 'common', label: '그 밖의 표현', color: '#E5CBAE' }]);
  $('#standards').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <h2 id="std-title" class="h2">살피는 기준</h2>
      <p style="margin:0;font-size:16px;line-height:1.75;max-width:46em">살핌은 아래의 판단 원칙 ${C.principleCount}개와 표현 기준 ${C.termCount}개로 문서를 살펴요. 모든 기준에는 출처가 있어요. 기준 버전: ${esc(C.version)}</p>
    </div>
    <h3 style="margin:16px 0 0;font-size:22px;font-weight:800">판단 원칙</h3>
    <table><thead><tr><th style="width:22%">원칙</th><th>원문</th><th style="width:24%">출처</th></tr></thead><tbody>
      ${Object.values(C.principles).map((p) => `<tr><td><b>${esc(p.title)}</b></td><td class="serif">${esc(p.text)}</td><td>${esc(p.src)} ${esc(p.page)}</td></tr>`).join('')}
    </tbody></table>
    ${bySeat.map((s) => {
      const ts = C.terms.filter((t) => t.seat === s.id);
      if (!ts.length) return '';
      return `<h3 style="margin:16px 0 0;font-size:22px;font-weight:800;display:flex;align-items:center;gap:10px"><i class="sq" style="background:${s.color}"></i>${esc(s.label)}</h3>
        <table><thead><tr><th style="width:18%">표현</th><th style="width:18%">대안</th><th>까닭</th><th style="width:22%">출처</th></tr></thead><tbody>
        ${ts.map((t) => `<tr><td><b>${esc(t.term)}</b><br><span class="lv lv-${t.lv}">${LV[t.lv]}</span></td><td>${esc(t.alt)}</td><td>${esc(t.reason)}${t.note ? `<br><span class="note">${esc(t.note)}</span>` : ''}</td><td>${esc(srcName(t.src))} ${esc(t.page)}</td></tr>`).join('')}
        </tbody></table>`;
    }).join('')}
    <p class="note">성소수자 자리는 따로 정한 표현 기준 대신, 성적지향·성별정체성을 다루는 문장에서 ‘문제·비행·치료’ 같은 말이 함께 쓰였는지를 살펴 ‘함께 읽어볼 문장’으로 보여드려요.</p>
    <div><button type="button" class="btn" data-go="home">← 처음으로</button></div>`;
}
