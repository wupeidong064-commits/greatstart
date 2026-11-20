import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ConfigProvider, Drawer as AntDrawer, Modal as AntModal, Popconfirm as AntPopconfirm, theme } from 'antd';
import type { DrawerProps, ModalFuncProps, ModalProps, PopconfirmProps, ThemeConfig } from 'antd';
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import zhCN from 'antd/locale/zh_CN';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { uiFont, visualTheme } from '../theme/visual';

const fontFamily = uiFont;
const classes = (...names: (string | undefined)[]) => names.filter(Boolean).join(' ');

/** Local form feedback and click lock; the original request and error handling stay with the page. */
export function useOverlaySubmit<T>(submit: (values: T) => unknown | Promise<unknown>) {
  const [submitting, setSubmitting] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const run = async (values: T) => {
    if (locked.current) return;
    locked.current = true;
    setSubmitting(true);
    try { return await submit(values); }
    finally {
      locked.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };
  return [run, submitting] as const;
}

function OverlayProvider({ children }: { children: ReactNode }) {
  const mode = useUiStore(state => state.theme);
  const size = useUiStore(state => state.interfaceSize);
  const dark = mode === 'dark';
  const config: ThemeConfig = {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      fontFamily, fontSize: 14, borderRadius: 8, borderRadiusLG: 16,
      colorPrimary: '#715bc7', colorInfo: '#715bc7',
      colorBgBase: dark ? '#201e2b' : '#fcfbff',
      colorBgContainer: dark ? '#272432' : '#ffffff',
      colorBgElevated: dark ? '#272432' : '#ffffff',
      colorBorder: dark ? '#494154' : '#ded6ee',
      colorBorderSecondary: dark ? '#393244' : '#ebe5f4',
      colorText: dark ? '#f1edf9' : '#302b3d',
      colorTextSecondary: dark ? '#b6adc6' : '#756c86',
    },
    components: {
      Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none' },
      Modal: { titleFontSize: 20, titleLineHeight: 1.5, headerBg: 'transparent', contentBg: dark ? '#201e2b' : '#fcfbff' },
      Drawer: { footerPaddingBlock: 16, footerPaddingInline: 24 },
      Table: { headerBg: dark ? '#2b2638' : '#f5f1fb', headerColor: dark ? '#b6adc6' : '#756c86', fontSize: 14 },
    },
  };
  return <ConfigProvider locale={zhCN} theme={visualTheme(config, dark, size / 100)} virtual={false} button={{ autoInsertSpace: false }}>{children}</ConfigProvider>;
}

function UnifiedModal(props: ModalProps) {
  const saving = !!props.confirmLoading || !!props.okButtonProps?.loading;
  return <OverlayProvider><AntModal
    {...props}
    transitionName=""
    maskTransitionName=""
    centered={props.centered ?? true}
    rootClassName={classes('bz-overlay-root', props.rootClassName)}
    closeIcon={props.closeIcon ?? <X size={18} aria-label="关闭" />}
    maskClosable={false}
    keyboard={saving ? false : props.keyboard ?? true}
    closable={saving ? false : props.closable}
    okText={props.okText ?? '确认'}
    cancelText={props.cancelText ?? '取消'}
    cancelButtonProps={{ ...props.cancelButtonProps, disabled: saving || props.cancelButtonProps?.disabled }}
  /></OverlayProvider>;
}

type StaticKind = 'confirm' | 'info' | 'success' | 'warning' | 'error';
function staticModal(kind: StaticKind) {
  return (props: ModalFuncProps) => {
    const icons = { confirm: <TriangleAlert size={22} />, info: <Info size={22} />, success: <CircleCheck size={22} />, warning: <TriangleAlert size={22} />, error: <CircleX size={22} /> };
    // Static dialogs have their own React root and outlive the page that opened
    // them. Destroy them when the authenticated session changes, especially
    // dialogs displaying an initial password.
    let unsubscribe = () => {};
    const dialog = AntModal[kind]({
      ...props,
      transitionName: '',
      maskTransitionName: '',
      afterClose: () => { unsubscribe(); props.afterClose?.(); },
      centered: props.centered ?? true,
      rootClassName: classes('bz-overlay-root', props.rootClassName),
      maskClosable: false,
      autoFocusButton: props.autoFocusButton ?? (props.okButtonProps?.danger || props.okType === 'danger' ? 'cancel' : 'ok'),
      icon: props.icon === undefined ? icons[kind] : props.icon,
      okText: props.okText ?? (kind === 'confirm' ? '确认' : '知道了'),
      cancelText: props.cancelText ?? '取消',
    });
    const identity = () => {
      const { token, user } = useAuthStore.getState();
      return JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.role, user?.managementLevel]);
    };
    const owner = identity();
    unsubscribe = useAuthStore.subscribe(() => {
      if (identity() !== owner) { unsubscribe(); dialog.destroy(); }
    });
    return dialog;
  };
}

export const Modal = Object.assign(UnifiedModal, {
  confirm: staticModal('confirm'), info: staticModal('info'), success: staticModal('success'),
  warning: staticModal('warning'), warn: staticModal('warning'), error: staticModal('error'),
  destroyAll: AntModal.destroyAll,
});

export function Drawer(props: DrawerProps) {
  return <OverlayProvider><AntDrawer {...props}
    rootClassName={classes('bz-overlay-root', props.rootClassName)}
    closeIcon={props.closeIcon ?? <X size={18} aria-label="关闭" />}
  /></OverlayProvider>;
}

export function Popconfirm(props: PopconfirmProps) {
  return <OverlayProvider><AntPopconfirm {...props}
    rootClassName={classes('bz-popconfirm-root', props.rootClassName)}
    icon={props.icon === undefined ? <TriangleAlert size={17} /> : props.icon}
    okText={props.okText ?? '确认'} cancelText={props.cancelText ?? '取消'}
  /></OverlayProvider>;
}

// Static confirms live in their own React roots; give them the same live theme and locale.
ConfigProvider.config({ holderRender: children => <OverlayProvider>{children}</OverlayProvider> });
