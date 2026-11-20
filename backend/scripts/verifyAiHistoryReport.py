"""Verify labeled values from three downloaded exports against the independently frozen October ledger."""
import json
import re
import sys
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2] / 'docs/acceptance/2026-11-16-ai-history-campus'
KIND = sys.argv[1] if len(sys.argv) > 1 else 'monthly'
assert KIND in ('monthly','daily','weekly')
STRUCTURED = len(sys.argv) > 2 and sys.argv[2] in ('structured','structured-corrected')
OUT = ROOT / ('monthly/corrected' if KIND == 'monthly' else KIND)
ANS = json.loads((ROOT / 'expected.json').read_text())['answers']['oct'] if KIND == 'monthly' else json.loads((OUT / 'expected.json').read_text())
START, END = ('2026-10-01','2026-10-31') if KIND == 'monthly' else (ANS['start'],ANS['end'])
BASENAME = '2026-10月报' if KIND == 'monthly' else KIND
if STRUCTURED:
    OUT = ROOT / 'structured-reports' / ('corrected' if sys.argv[2]=='structured-corrected' else '') / KIND
    BASENAME = KIND
    ANS = json.loads((OUT / 'expected.json').read_text())
    START, END = ANS['start'], ANS['end']
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      's': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


class HtmlRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
        if tag in ('th', 'td'):
            self.cell = ''

    def handle_data(self, value):
        self.text.append(value)
        if self.cell is not None:
            self.cell += value

    def handle_endtag(self, tag):
        if tag in ('td', 'th'):
            self.row.append(self.cell)
            self.cell = None
        if tag == 'tr':
            self.rows.append(self.row)
            self.row = None


def read_rows(fmt):
    file = OUT / (BASENAME + '.' + fmt)
    if fmt == 'html':
        parser = HtmlRows()
        parser.feed(file.read_text())
        return parser.rows, ' '.join(parser.text)
    with ZipFile(file) as z:
        if fmt == 'docx':
            document = ET.fromstring(z.read('word/document.xml'))
            rows = [[''.join(c.itertext()) for c in r.findall('w:tc', NS)] for r in document.findall('.//w:tr', NS)]
            return rows, ' '.join(document.itertext())
        strings = [''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        rows = []
        for name in z.namelist():
            if not re.fullmatch(r'xl/worksheets/sheet\d+\.xml', name):
                continue
            for row in ET.fromstring(z.read(name)).findall('.//s:row', NS):
                cells = []
                for c in row.findall('s:c', NS):
                    ref = re.match('[A-Z]+', c.get('r'))[0]
                    col = 0
                    for ch in ref:
                        col = col * 26 + ord(ch) - 64
                    cells.extend([''] * (col - len(cells)))
                    v = c.findtext('s:v', default='', namespaces=NS)
                    cells[col - 1] = strings[int(v)] if c.get('t') == 's' else v
                rows.append(cells)
        return rows, ' '.join(strings)


def number(raw):
    return Decimal(str(raw).replace(',', '').replace('%',''))


def matches(rows, label, indices, target):
    for r in rows:
        if not r or r[0] != label or len(r) <= max(indices):
            continue
        try:
            if all(number(r[i]) == Decimal(str(t)) for i,t in zip(indices,target)):
                return True
        except ArithmeticError:
            continue
    return False


def main():
    results = {}
    for fmt in ('html','docx','xlsx'):
        rows, text = read_rows(fmt)
        yuan = lambda key: Decimal(ANS[key]) / 100
        checks = {}
        for label, key in [('本期确认成单总额','gross'),('本期新签成单额','signup'),('本期续费成单额','renewal'),
                           ('已确认退费','refund'),('扣退费后的净成单','net')]:
            checks[label] = matches(rows,label,[1],[yuan(key)])
        for label, (cnt,amount) in [('新签',(ANS['signupCount'],yuan('signup'))),('续费',(ANS['renewalCount'],yuan('renewal')))]:
            checks[label+'笔数和金额'] = matches(rows,label,[1,2],[cnt,amount])
        checks['全校应到和实到'] = matches(rows,'当前授权校区',[1,2],[ANS['due'],ANS['arrived']])
        for label, key in [('乔老师','coachA'),('温老师','coachB')]:
            if key not in ANS['teaching']:
                continue
            coach=ANS['teaching'][key]
            checks[label+'应到和实到'] = matches(rows,label,[2,3],[coach['due'],coach['arrived']])
        checks['无课消当收入或成单当收款表述'] = all(t not in text for t in ('本期确认收入0元','本期新签收款2','本期收款结构'))
        checks['文件含报告期间'] = START in text and END in text
        checks['固定建议提示一次'] = text.count('AI 建议仅供参考。') == 1
        if STRUCTURED:
            record = json.loads((OUT / 'check.json').read_text())
            checks['分析状态与正文一致'] = ('经营分析待确认' not in text) == record['analysisComplete']
            # Exact prose is normalized only for whitespace and the compact source-reference suffix.
            flat = lambda value: re.sub(r'\s+', '', re.sub(r'（(?:来源|依据)：[^）]+）', '', value))
            checks['摘要段落有据可读回'] = bool(record['summary']) and all(flat(paragraph) in flat(text) for paragraph in record['summary'])
            checks['来源索引可读回'] = bool(record['citedSourceIds']) and all(i in text for i in record['citedSourceIds'])
        else:
            checks['标明经营分析未通过'] = '经营分析待确认' in text
        results[fmt] = checks
    failed = [(k,v) for k,group in results.items() for v,passed in group.items() if not passed]
    output = {'period':START+'/'+END,'testedFormats':results,'passed':sum(sum(group.values()) for group in results.values()),'failed':failed}
    (OUT / 'format-reconciliation.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print(output['passed'],failed)
    assert not failed

if __name__ == '__main__':
    main()
