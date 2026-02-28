import { ThemeConfig } from 'antd';

/**
 * 清新绿色主题配置
 * 适用于教育管理系统
 */
export const greenTheme: ThemeConfig = {
  token: {
    // 主色调 - 清新绿色 (#10b981 是 Tailwind CSS 的 emerald-500)
    colorPrimary: '#10b981',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',

    // 圆角设置
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // 字体设置
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    fontSize: 14,

    // 间距设置
    marginXS: 8,
    marginSM: 12,
    margin: 16,
    marginMD: 20,
    marginLG: 24,
    marginXL: 32,

    // 边框设置
    lineWidth: 1,
    lineType: 'solid',

    // 动画时长
    motionDurationFast: '0.1s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
  },
  components: {
    // 按钮组件
    Button: {
      primaryShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
      paddingContentHorizontalLG: 20,
    },

    // 卡片组件
    Card: {
      borderRadiusLG: 12,
    },

    // 输入框组件
    Input: {
      borderRadiusLG: 8,
    },

    // 表格组件
    Table: {
      headerBg: '#f8fafc',
      headerColor: '#475569',
    },

    // 菜单组件
    Menu: {
      itemBorderRadius: 8,
      itemSelectedBg: '#ecfdf5',
      itemSelectedColor: '#10b981',
    },

    // 布局组件
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 64,
      siderBg: '#ffffff',
    },

    // 标签页
    Tabs: {
      itemActiveColor: '#10b981',
      itemSelectedColor: '#10b981',
    },

    // 选择器
    Select: {
      optionSelectedBg: '#ecfdf5',
    },

    // 复选框
    Checkbox: {
      colorPrimary: '#10b981',
    },

    // 单选框
    Radio: {
      colorPrimary: '#10b981',
    },

    // 开关
    Switch: {
      colorPrimary: '#10b981',
    },
  },
};

/**
 * 现代蓝色主题配置
 * 适用于企业应用
 */
export const blueTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#1677ff',
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
  },
  components: {
    Button: {
      primaryShadow: '0 2px 8px rgba(22, 119, 255, 0.3)',
    },
    Menu: {
      itemSelectedBg: '#e6f4ff',
      itemSelectedColor: '#1677ff',
    },
  },
};

/**
 * 优雅紫色主题配置
 * 高端现代感
 */
export const purpleTheme: ThemeConfig = {
  token: {
    colorPrimary: '#8b5cf6',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#6366f1',
    borderRadius: 8,
    borderRadiusLG: 12,
  },
  components: {
    Button: {
      primaryShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
    },
    Menu: {
      itemSelectedBg: '#f5f3ff',
      itemSelectedColor: '#8b5cf6',
    },
  },
};

/**
 * 暗黑主题配置
 * 需配合 theme.darkAlgorithm 使用
 */
export const darkTheme: ThemeConfig = {
  token: {
    colorPrimary: '#10b981',
    colorBgBase: '#141414',
    borderRadius: 8,
    borderRadiusLG: 12,
  },
};
