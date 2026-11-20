/**
 * 保存状态反馈（交互规范：按钮依次显示「保存中→已保存」，失败保留填写内容）。
 * 状态依据真实接口结果流转，不用动画计时假装完成。
 *
 * 用法：
 *   const save = useSaveState();
 *   <Button className={`bz-save-btn ${save.cls}`} disabled={save.busy} onClick={() => save.wrap(async () => { await api.post(...); })}>
 *     {save.label}
 *   </Button>
 *   // wrap 内抛错时进入 error 态并保留原表单值（调用方自行不 reset）
 */
import { useCallback, useRef, useState } from 'react';

export type SaveStateName = 'idle' | 'saving' | 'saved' | 'error';

export function useSaveState() {
  const [state, setState] = useState<SaveStateName>('idle');
  const timerRef = useRef<number | null>(null);

  const wrap = useCallback(async (fn: () => Promise<unknown>) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setState('saving');
    try {
      await fn();
      setState('saved');
      timerRef.current = window.setTimeout(() => setState('idle'), 1800);
    } catch (e) {
      setState('error');
      throw e; // 调用方决定提示方式；表单值不被本 hook 清除
    }
  }, []);

  return {
    state,
    busy: state === 'saving',
    cls: state === 'saving' ? 'is-saving' : state === 'saved' ? 'is-saved' : '',
    label: state === 'saving' ? '保存中…' : state === 'saved' ? '已保存' : null,
    wrap,
  };
}
