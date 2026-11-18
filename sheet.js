// 살핌 · 전수조사 모음을 엑셀(.xlsx)로 만들기 (브라우저 안에서, JSZip 사용)
// 엑셀·한셀·구글 시트에서 열려요. 소관부서·반영여부·비고 칸은 노란색으로 비워 두고, 반영여부는 목록에서 고를 수 있어요.
const x = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').slice(0, 32000);

function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

// 스타일 번호: 0 기본, 1 머리글, 2 본문, 3 빈칸(채워 넣을 칸), 4 본문 가운데
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE6DA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6D1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB9AE9F"/></left><right style="thin"><color rgb="FFB9AE9F"/></right><top style="thin"><color rgb="FFB9AE9F"/></top><bottom style="thin"><color rgb="FFB9AE9F"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// cols: [{ h: 머리글, w: 너비, fill?: true(채워 넣을 칸), center?: true, list?: ['반영', …] }]
function sheetXml(cols, rows) {
  const ref = (c, r) => colName(c) + r;
  const cell = (v, c, r, st) => {
    if (typeof v === 'number') return `<c r="${ref(c, r)}" s="${st}"><v>${v}</v></c>`;
    if (v == null || v === '') return `<c r="${ref(c, r)}" s="${st}"/>`;
    return `<c r="${ref(c, r)}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  };
  const head = `<row r="1" ht="24" customHeight="1">${cols.map((c, i) => cell(c.h, i, 1, 1)).join('')}</row>`;
  const body = rows.map((row, ri) => `<row r="${ri + 2}">${cols.map((c, i) => cell(row[i], i, ri + 2, c.fill ? 3 : c.center ? 4 : 2)).join('')}</row>`).join('');
  const last = Math.max(2, rows.length + 1), lastCol = colName(cols.length - 1);
  const dv = cols.map((c, i) => c.list ? `<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${colName(i)}2:${colName(i)}${Math.max(last, 500)}"><formula1>"${c.list.join(',')}"</formula1></dataValidation>` : '').filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16.5"/>
<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${head}${body}</sheetData>
<autoFilter ref="A1:${lastCol}${last}"/>
${dv.length ? `<dataValidations count="${dv.length}">${dv.join('')}</dataValidations>` : ''}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>
</worksheet>`;
}

export async function buildXlsx(sheets, JSZip) {
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>살핌 전수조사</dc:title><dc:creator>살핌</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`);
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${sheets.map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(s.name)}'!$A$1:$${colName(s.cols.length - 1)}$${Math.max(2, s.rows.length + 1)}</definedName>`).join('')}</definedNames></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => z.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.cols, s.rows)));
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const REFLECT = ['반영', '일부 반영', '미반영(유지)', '검토 중', '해당 없음'];
