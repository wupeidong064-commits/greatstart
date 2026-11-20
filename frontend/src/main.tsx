import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import App from './App';
import './index.css';
import './workbench-motion.css';
import './biz-table.css';
import './overlays.css';
import './visual-system.css';
import './interface-size.css';
import { visualTheme } from './theme/visual';
import { indigoLightTheme, indigoDarkTheme } from './theme';
import { useUiStore } from './store/uiStore';

/** 订阅外观模式：驱动 antd 算法与 html data-theme（CSS 变量）双轨切换 */
const ThemedApp: React.FC = () => {
  const mode = useUiStore((s) => s.theme);
  const interfaceSize = useUiStore((s) => s.interfaceSize);

  React.useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const themeConfig = React.useMemo(
    () =>
      mode === 'dark'
        ? visualTheme({ ...indigoDarkTheme, algorithm: antdTheme.darkAlgorithm }, true, interfaceSize / 100)
        : visualTheme(indigoLightTheme, false, interfaceSize / 100),
    [mode, interfaceSize]
  );

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig} virtual={false}>
      <App />
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>
);
