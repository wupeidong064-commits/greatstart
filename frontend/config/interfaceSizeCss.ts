import type { Plugin, Rule } from 'postcss';

/** Keep authored breakpoints in logical UI pixels when native zoom is selected.
 * This also applies to lazy page CSS. No runtime stylesheet rewriting is needed.
 * Unauthenticated pages use the original rules; third-party CSS is left alone. */
export function interfaceSizeCss(): Plugin {
  return {
    postcssPlugin: 'greatstart-interface-size',
    Once(root) {
      if (root.source?.input.file?.includes('node_modules')) return;
      root.walkDecls(declaration => {
        if (declaration.prop.startsWith('--')) return;
        declaration.value = declaration.value.replace(/\b(\d*\.?\d+)(?:d|s)?v([wh])\b/g,
          (_, amount, axis) => `calc(var(--ui-v${axis}, 1v${axis}) * ${amount})`);
      });
      const media: typeof root.nodes = [];
      root.walkAtRules('media', rule => { if (/\((?:min-|max-)?(?:width|height)\s*:\s*[\d.]+px\)/.test(rule.params)) media.push(rule); });
      for (const original of media) {
        if (original.type !== 'atrule') continue;
        for (const size of [100, 125, 150]) {
          const variant = original.clone();
          variant.params = original.params.replace(/((?:min-|max-)?(?:width|height)\s*:\s*)([\d.]+)px/g,
            (_, prefix, value) => `${prefix}${Number(value) * size / 100}px`);
          const scope = size === 100
            ? ':where(html:not([data-ui-size]), html[data-ui-size="100"])'
            : `:where(html[data-ui-size="${size}"])`;
          variant.walkRules((rule: Rule) => {
            if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
            rule.selectors = rule.selectors.map(selector => /^(html|:root)(?=[\s.#[:>+~]|$)/.test(selector)
              ? selector.replace(/^(html|:root)/, `$1:is(${scope})`)
              : `${scope} ${selector}`);
          });
          original.before(variant);
        }
        original.remove();
      }
    },
  };
}
