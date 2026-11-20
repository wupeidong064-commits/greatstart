import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * bz-table 表格语言 · 单行展开状态机（与 biz-table.css 配套）
 *
 * 规则（2026-11-03 用户定稿）：
 * - 同一时间只展开一行；切换时旧行走 180ms 退出动效，新行同步展开；
 * - 收起期间保持挂载（is-close），190ms 后卸载，保证退出动画可见；
 * - 动效进行中再次点击时丢弃上一轮未完成的收起，避免行被永久钉在展开态。
 */

export interface BzExpandState {
  /** 当前展开的行 id（null = 无） */
  expandedId: string | null;
  /** 正在播放退出动效的行 id */
  closingId: string | null;
  toggleExpand: (id: string) => void;
  /** 传给 antd Table expandable.expandedRowKeys */
  expandedRowKeys: string[];
}

export function useBzExpand(): BzExpandState {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const toggleExpand = (id: string) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
      // 丢弃上一轮未完成的收起（该行立即卸载）
      setClosingId(null);
    }
    if (expandedId === id) {
      setClosingId(id);
      setExpandedId(null);
      closeTimerRef.current = window.setTimeout(() => setClosingId(null), 190);
    } else {
      if (expandedId) {
        const prev = expandedId;
        setClosingId(prev);
        closeTimerRef.current = window.setTimeout(() => setClosingId(null), 190);
      }
      setExpandedId(id);
    }
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  return {
    expandedId,
    closingId,
    toggleExpand,
    expandedRowKeys: Array.from(new Set([expandedId, closingId].filter(Boolean) as string[])),
  };
}

/** 默认行键；低出勤等复合键页面传入 getKey 覆盖 */
type GetKey<T> = (record: T) => string;
const defaultGetKey = <T,>(record: T) => (record as { id?: string }).id as string;

/** 生成 antd Table expandable 配置：行首箭头（旋转 90°）+ bz-x 动效包装。 */
export function bzExpandable<T>(
  state: BzExpandState,
  render: (record: T) => ReactNode,
  getKey: GetKey<T> = defaultGetKey
) {
  return {
    expandedRowKeys: state.expandedRowKeys,
    expandIcon: ({ expanded, record }: { expanded: boolean; record: T }) => (
      <button
        type="button"
        className={`bz-x-arrow${expanded ? ' is-open' : ''}`}
        aria-expanded={expanded}
        aria-label={expanded ? '收起详情' : '查看详情'}
        onClick={(e) => {
          e.stopPropagation();
          state.toggleExpand(getKey(record));
        }}
      >
        <ChevronRight size={15} />
      </button>
    ),
    expandedRowRender: (record: T) => (
      <div className={`bz-x ${state.closingId === getKey(record) ? 'is-close' : 'is-open'}`}>
        <div className="bz-x-inner">
          <div className="bz-x-body">{render(record)}</div>
        </div>
      </div>
    ),
  };
}

/** 展开行淡紫高亮：rowClassName={(r) => bzRowClass(state, r[, getKey])} */
export function bzRowClass<T>(
  state: BzExpandState,
  record: T,
  getKey: GetKey<T> = defaultGetKey
): string {
  return getKey(record) === state.expandedId ? 'bz-row-open' : '';
}
