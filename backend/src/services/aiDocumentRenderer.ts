import AdmZip from 'adm-zip';
import { evidenceUnit } from './aiOperatingFacts';
export interface SnapshotCard {
  title?: string;
  tool?: string;
  caliber?: string;
  timeRange?: { start: string; end: string } | null;
  generatedAt?: string;
  columns?: Array<{ key: string; label: string }>;
  rows?: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
  missing?: string[];
  error?: string | null;
}
function xml(v: unknown) {
  return String(v ?? '—')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const DOC_FONT =
  process.env.AI_DOCUMENT_FONT || (process.platform === 'darwin' ? 'STHeiti' : 'Noto Sans CJK SC');
function p(text: unknown, style = 'Normal') {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${xml(DOC_FONT)}" w:hAnsi="${xml(DOC_FONT)}" w:eastAsia="${xml(DOC_FONT)}" w:hint="eastAsia"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}
function table(headers: string[], rows: unknown[][]) {
  const width = Math.floor(9600 / Math.max(1, headers.length));
  const row = (cells: unknown[], head = false) =>
    `<w:tr><w:trPr>${head ? '<w:tblHeader/>' : ''}</w:trPr>${cells.map((v) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${head ? '<w:shd w:fill="F0F0F0"/>' : ''}</w:tcPr>${p(v, head ? 'TableHead' : 'TableText')}</w:tc>`).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${headers.map(() => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${row(headers, true)}${rows.map((r) => row(r)).join('')}</w:tbl>`;
}
/** Fixed OOXML, no HTML, external relationships, macros or user-controlled markup. */
export function renderDocx(title: string, institution: string, cards: SnapshotCard[], snapshotVersion?:string, advice?: string): Buffer {
  const body = [
    p(title, 'Title'),
    p(institution || '本机构', 'Subtitle'),
    p('本报告汇总对应范围的业务数据，统计期间、口径与资料说明见各章节。'),
  ];
  for (const card of cards) {
    body.push(p(card.title || '业务分析', 'Heading1'));
    body.push(
      p(
        card.timeRange
          ? `统计期间：${card.timeRange.start} 至 ${card.timeRange.end}（上海业务日）`
          : '统计范围：当前快照/用户文件，未推定区间流量'
      )
    );
    body.push(p(`数据更新时间：${card.generatedAt || '未记录'}`));
    const totals = Object.entries(card.totals || {});
    if (totals.length)
      body.push(
        table(
          ['指标', '结果'],
          totals.map(([k, v]) => [evidenceUnit(k) ? k+'（'+evidenceUnit(k)+'）' : k, v])
        )
      );
    const rows = card.rows || [],
      cols = card.columns || [];
    body.push(p(`明细共 ${rows.length} 条；以下保留全部明细。`));
    if (!rows.length) body.push(p('当前范围没有匹配记录；不据此推断其他期间。'));
    // Wide schemas are divided into column groups, with an identical source row index.
    for (let offset = 0; offset < cols.length && rows.length; offset += 4) {
      const group = cols.slice(offset, offset + 4);
      if (cols.length > 4)
        body.push(
          p(`明细字段组 ${Math.floor(offset / 4) + 1}（按行号与其他字段组对应）`, 'Heading2')
        );
      body.push(
        table(
          ['行号', ...group.map(c => evidenceUnit(c.key) && !c.label.includes('（') ? c.label+'（'+evidenceUnit(c.key)+'）' : c.label)],
          rows.map((r, i) => [
            i + 1,
            ...group.map((c) => {
              const v = r[c.key];
              return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
            }),
          ])
        )
      );
    }
    body.push(p('口径与来源', 'Heading2'), p(card.caliber || '未提供口径'));
    for (const note of card.missing || []) body.push(p('数据说明：' + note));
  }
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  if (advice) body.push(p('管理建议','Heading1'), ...advice.split(/\n+/).filter(Boolean).map(line=>p(line)));
  const zip = new AdmZip();
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`
    )
  );
  zip.addFile(
    '_rels/.rels',
    Buffer.from(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    )
  );
  zip.addFile('docProps/core.xml', Buffer.from(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:description>${snapshotVersion ? '经营数据快照 '+xml(snapshotVersion) : ''}</dc:description></cp:coreProperties>`
  ));
  zip.addFile(
    'word/_rels/document.xml.rels',
    Buffer.from(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'
    )
  );
  zip.addFile(
    'word/styles.xml',
    Buffer.from(
      `<w:styles xmlns:w="${ns}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${xml(DOC_FONT)}" w:hAnsi="${xml(DOC_FONT)}" w:eastAsia="${xml(DOC_FONT)}"/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="300" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>${[
        ['Normal', 22],
        ['Title', 32],
        ['Subtitle', 24],
        ['Heading1', 26],
        ['Heading2', 22],
        ['TableHead', 20],
        ['TableText', 20],
      ]
        .map(
          ([name, size]) =>
            `<w:style w:type="paragraph" w:styleId="${name}"><w:name w:val="${name}"/><w:pPr>${['Title', 'Subtitle', 'Heading1', 'Heading2'].includes(String(name)) ? '<w:keepNext/>' : ''}<w:spacing w:before="80" w:after="80"/></w:pPr><w:rPr><w:sz w:val="${size}"/><w:color w:val="000000"/>${['Title', 'Heading1', 'Heading2', 'TableHead'].includes(String(name)) ? '<w:b/>' : ''}</w:rPr></w:style>`
        )
        .join('')}</w:styles>`
    )
  );
  zip.addFile(
    'word/footer1.xml',
    Buffer.from(
      `<w:ftr xmlns:w="${ns}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>蜂鸣课务 · 第 </w:t></w:r><w:fldSimple w:instr="PAGE"/><w:r><w:t> 页</w:t></w:r></w:p></w:ftr>`
    )
  );
  zip.addFile(
    'word/document.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:footerReference w:type="default" r:id="rFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1153" w:bottom="1000" w:left="1153" w:header="500" w:footer="500"/></w:sectPr></w:body></w:document>`
    )
  );
  return zip.toBuffer();
}
