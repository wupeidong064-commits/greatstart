import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import postcss from 'postcss';

const source = await fs.readFile(new URL('../config/interfaceSizeCss.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { interfaceSizeCss } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const input = `html { --sample: 1vw; }
.page { height: calc(100dvh - 60px); width: min(100vw, 300px); border: 1px solid; }
@media screen and (max-width: 768px) { html[data-theme="light"] .page, .box { display: grid; } }
@media (min-width: 1200px) and (max-height: 900px) { :root .box { display: flex; } }
@media (prefers-reduced-motion: reduce) { .box { transition: none; } }`;
const { css, root } = await postcss([interfaceSizeCss()]).process(input, { from: '/src/example.css' });
for (const expected of ['max-width: 768px', 'max-width: 960px', 'max-width: 1152px',
  'min-width: 1500px', 'max-height: 1125px', '--ui-vh', '--ui-vw', '--sample: 1vw',
  'border: 1px solid', ':where(html[data-ui-size="150"]) .box', 'prefers-reduced-motion']) {
  assert.ok(css.includes(expected), expected);
}
let mediaCount = 0;
root.walkAtRules('media', () => mediaCount++);
assert.equal(mediaCount, 7);
root.walkRules(rule => {
  // An html selector must still select html, rather than an impossible descendant html.
  if (rule.selector.includes('html[data-theme')) assert.fail('Unscoped theme selector inside scaled breakpoint');
  assert.ok(!rule.selector.includes('html :root'));
});
assert.equal((await postcss([interfaceSizeCss()]).process(input, { from: '/node_modules/example/style.css' })).css, input);
console.log('PASS: scaled breakpoints, theme selectors, viewport units, motion preferences and vendor isolation');
