// 살핌 · 검토 결과를 워드(.docx)로 만들기 (브라우저 안에서, JSZip 사용)
const x = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const FONT = '맑은 고딕';

function run(text, o = {}) {
  const pr = [o.b ? '<w:b/>' : '', o.color ? `<w:color w:val="${o.color}"/>` : '', o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''].join('');
  return String(text ?? '').split('\n').map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(line)}</w:t></w:r>`).join('');
}
function para(runs, o = {}) {
  const pr = [o.style ? `<w:pStyle w:val="${o.style}"/>` : '', o.jc ? `<w:jc w:val="${o.jc}"/>` : '',
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 80}"/>`].join('');
  return `<w:p><w:pPr>${pr}</w:pPr>${runs}</w:p>`;
}
const P = (t, o = {}) => para(run(t, o), o);

function cell(content, w, o = {}) {
  const shade = o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : '';
  const body = Array.isArray(content) ? content.map((c) => para(c, { after: 0 })).join('') : para(content, { after: 0 });
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade}<w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${body}</w:tc>`;
}
function table(widths, head, rows) {
  const b = '<w:top w:val="single" w:sz="4" w:color="A39A8E"/><w:left w:val="single" w:sz="4" w:color="A39A8E"/><w:bottom w:val="single" w:sz="4" w:color="A39A8E"/><w:right w:val="single" w:sz="4" w:color="A39A8E"/><w:insideH w:val="single" w:sz="4" w:color="A39A8E"/><w:insideV w:val="single" w:sz="4" w:color="A39A8E"/>';
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const hr = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, i) => cell(run(h, { b: true, sz: 18 }), widths[i], { fill: 'EFE6DA' })).join('')}</w:tr>`;
  const br = rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, widths[i])).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${b}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${hr}${br}</w:tbl>${P('', { after: 0 })}`;
}
const fmtDate = (d) => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;

export async function buildDocx(D, JSZip) {
  const { s, req, useAI } = D;
  const sm = (t) => run(t, { sz: 18 });
  const mut = (t) => run(t, { sz: 16, color: '6B6480' });
  const body = [];
  body.push(P('살핌 검토 결과 · 반영 협조 요청', { sz: 18, color: '6B6480', after: 40 }));
  body.push(P(s.name, { style: 'Title', b: true, sz: 32, after: 200 }));

  const W1 = [3000, 11400];
  const kv = (k, v) => [run(k, { b: true, sz: 18 }), sm(v)];
  body.push(table(W1, ['항목', '내용'], [
    kv('수신(소관 부서)', req.to || ''),
    kv('요청 부서 · 담당자', req.from || ''),
    kv('회신 기한', req.due || ''),
    kv('살핀 일시 · 문서', `${fmtDate(s.at)} · ${s.doc.kind} ${s.doc.kind === 'PDF' ? s.doc.pages + '쪽' : s.doc.pages + '개 문단'}${s.doc.ocr ? ' (이미지 PDF를 글자로 바꿔 읽음)' : ''}`),
    kv('적용 기준', `살핌 기준 ${window.SALPIM_CRITERIA.version} · 살핀 자리: ${s.seats.map((id) => window.SALPIM_CRITERIA.seats.find((z) => z.id === id)?.label || id).join(', ')}`),
  ]));

  body.push(P('요청 내용', { b: true, sz: 24, before: 200, after: 80 }));
  body.push(P(req.msg || '', { sz: 20, after: 160 }));

  body.push(P(`1. 고쳐 쓰면 좋은 표현 (${D.fMain.length}가지)`, { b: true, sz: 24, before: 200, after: 80 }));
  if (D.fMain.length) {
    const W = [600, 2100, 4100, 1900, 3300, 1100, 1300];
    body.push(table(W, ['번호', '표현 · 위치', '예시 문장', '고쳐 쓸 말', '근거', '반영 여부', '비고'],
      D.fMain.map(({ g, gi }, n) => [sm(String(n + 1)), [run(g.hits[0].hit, { b: true, sz: 18 }), mut(D.locs(g))], sm(D.ex(g)), sm(D.alt(g)),
        useAI && D.aiNoteF(gi) ? [sm(g.term.reason), mut('맥락 확인: ' + D.aiNoteF(gi))] : sm(g.term.reason), sm(''), sm('')])));
  } else body.push(P('없음', { sz: 20 }));

  body.push(P(`2. 함께 읽어볼 문장 (${D.rMain.length}개)`, { b: true, sz: 24, before: 200, after: 80 }));
  if (D.rMain.length) {
    const W = [600, 1100, 5800, 4500, 1100, 1300];
    body.push(table(W, ['번호', '위치', '문장', '함께 생각해볼 질문', '반영 여부', '비고'],
      D.rMain.map(({ x: r, v }, n) => [sm(String(n + 1)), sm(r.loc), sm(D.rtext(r)),
        v ? [sm(r.questions.map((q) => q.q).join(' ')), mut('맥락 확인: ' + (v.why ? v.why : ''))] : sm(r.questions.map((q) => q.q).join(' ')), sm(''), sm('')])));
  } else body.push(P('없음', { sz: 20 }));

  const okList = [...D.fOk.map(({ g }) => `${g.hits[0].hit} (${D.locs(g)})`), ...D.rOk.map(({ x: r }) => `${r.loc} 문장`)];
  if (okList.length) {
    body.push(P(`참고 · 맥락상 괜찮다고 본 항목 (${okList.length})`, { b: true, sz: 20, before: 200, after: 60 }));
    body.push(P(okList.join(' · '), { sz: 18, color: '6B6480' }));
  }
  body.push(P('안내', { b: true, sz: 20, before: 240, after: 60 }));
  body.push(P('살핌은 국가인권위원회, 국립국어원, 서울시 성평등 언어사전 등 공식 자료에 근거한 표현 기준으로 문서를 살핍니다. 결과는 참고 의견이며, 법령·사업의 고유 명칭처럼 그대로 두는 것이 맞는 경우도 있으니 소관 부서에서 판단해 주세요.', { sz: 18, color: '4A4472' }));
  body.push(P('반영 여부 칸에는 「반영」「미반영」「검토 중」 등을, 비고 칸에는 미반영 사유나 반영 예정 시기를 적어 회신해 주세요.', { sz: 18, color: '4A4472' }));
  body.push(P('살핌 · 한국청소년활동진흥원 AX 실천공동체', { sz: 16, color: '6B6480', before: 160 }));

  const sect = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr>';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
</w:styles>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x('살핌 검토 결과 · ' + s.name)}</dc:title><dc:creator>살핌</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', styles);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
