import type { ThemeConfig } from 'antd';

/** Shared by the page and portal roots. Keep text to four sizes and three weights. */
export const uiFont = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans", sans-serif';
export function visualTheme(base: ThemeConfig, dark: boolean, scale = 1): ThemeConfig {
  const components = base.components || {};
  return {
    ...base,
    token: {
      ...base.token,
      // Business controls must not remain in an intermediate enter/leave frame.
      // Use Ant's motion context (including rc-motion lifecycle), rather than
      // overriding CSS animation duration and leaving callbacks outstanding.
      motion: false,
      // Ant responsive grids/observers must use the same logical width as page CSS.
      ...Object.fromEntries(Object.entries({ screenXS: 480, screenXSMin: 480, screenXSMax: 575,
        screenSM: 576, screenSMMin: 576, screenSMMax: 767,
        screenMD: 768, screenMDMin: 768, screenMDMax: 991,
        screenLG: 992, screenLGMin: 992, screenLGMax: 1199,
        screenXL: 1200, screenXLMin: 1200, screenXLMax: 1599,
        screenXXL: 1600, screenXXLMin: 1600 }).map(([name, value]) => [name, value * scale])),
      fontFamily: uiFont, fontSize: 14, fontSizeSM: 12, fontSizeLG: 14, fontSizeXL: 20,
      fontSizeHeading1: 20, fontSizeHeading2: 14, fontSizeHeading3: 14, fontSizeHeading4: 14, fontSizeHeading5: 14,
      fontWeightStrong: 600, lineWidthFocus: 2,
      colorPrimary: '#715bc7', colorInfo: '#715bc7',
      colorText: dark ? '#fafafa' : '#24212b',
      colorTextSecondary: dark ? '#b0adbb' : '#686372',
      colorBorder: dark ? '#3f3f46' : '#e4e0ec',
      colorBorderSecondary: dark ? '#27272a' : '#e4e0ec',
      colorBgContainer: dark ? '#18181b' : '#ffffff',
      colorBgElevated: dark ? '#1f1f23' : '#ffffff',
      colorSuccess: dark ? '#34d399' : '#059669',
      colorWarning: dark ? '#fbbf24' : '#b45309',
      colorError: dark ? '#f87171' : '#dc2626',
      boxShadow: 'var(--ui-shadow-overlay)', boxShadowSecondary: 'var(--ui-shadow-overlay)',
      boxShadowTertiary: 'var(--ui-shadow-card)',
    },
    components: {
      ...components,
      Button: { ...components.Button, fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none' },
      Modal: { ...components.Modal, titleFontSize: 20, titleLineHeight: 1.5 },
      Drawer: { ...components.Drawer, fontSizeLG: 20 },
      Table: { ...components.Table, fontSize: 14, fontSizeSM: 14 },
      Statistic: { ...components.Statistic, titleFontSize: 12, contentFontSize: 28 },
      Tag: { ...components.Tag, fontSizeSM: 12 },
      Tooltip: { ...components.Tooltip, fontSize: 12 },
      Popconfirm: { ...components.Popconfirm, fontSize: 14 },
    },
  };
}
