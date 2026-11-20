import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * UI 状态：外观模式 + 界面大小 + 常用功能收藏 + 侧栏折叠
 *
 * 持久化：localStorage（键 buzzer-ui-v1）。
 * 说明：后端当前没有用户偏好接口，故为单机持久化（同浏览器跨会话保留，
 * 不跨设备同步）；后端接口就绪后可在 hydrate 后改为服务端同步。
 */

export type ThemeMode = 'dark' | 'light';
export type InterfaceSize = 100 | 125 | 150;
export const INTERFACE_SIZES = [
  { value: 100, label: '标准 100%' },
  { value: 125, label: '舒适 125%' },
  { value: 150, label: '大字 150%' },
] as const;

export const DEFAULT_FAVORITES = [
  'attendance', // 班级出勤
  'conleave', // 连续请假学员
  'teachers', // 老师数据
  'renewal', // 续费管理
  'lost', // 流失学员库
  'pool', // 营销与销售（鱼池）
  'experience', // 体验课表
  'sales', // 销售数据分析
];

export type AddFavoriteResult = 'added' | 'exists' | 'removed';

interface UiState {
  theme: ThemeMode;
  interfaceSize: InterfaceSize;
  setInterfaceSize: (size: InterfaceSize) => void;
  favorites: string[];
  siderCollapsed: boolean;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  /** 加入收藏；已存在时不重复添加（幂等） */
  addFavorite: (funcId: string) => AddFavoriteResult;
  removeFavorite: (funcId: string) => void;
  toggleFavorite: (funcId: string) => AddFavoriteResult;
  isFavorite: (funcId: string) => boolean;
  toggleSiderCollapsed: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      interfaceSize: 125,
      setInterfaceSize: (size) => {
        if (INTERFACE_SIZES.some(option => option.value === size)) set({ interfaceSize: size });
      },
      favorites: DEFAULT_FAVORITES,
      siderCollapsed: false,

      setTheme: (mode) => set({ theme: mode }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),

      addFavorite: (funcId) => {
        const { favorites } = get();
        if (favorites.includes(funcId)) return 'exists';
        set({ favorites: [...favorites, funcId] });
        return 'added';
      },

      removeFavorite: (funcId) => {
        set({ favorites: get().favorites.filter((id) => id !== funcId) });
      },

      toggleFavorite: (funcId) => {
        const { favorites, addFavorite, removeFavorite } = get();
        if (favorites.includes(funcId)) {
          removeFavorite(funcId);
          return 'removed';
        }
        return addFavorite(funcId);
      },

      isFavorite: (funcId) => get().favorites.includes(funcId),

      toggleSiderCollapsed: () => set({ siderCollapsed: !get().siderCollapsed }),
    }),
    {
      name: 'buzzer-ui-v1',
      storage: createJSONStorage(() => localStorage),
      // Old browser preferences have no size field; preserve theme/favorites and use comfort.
      merge: (persisted, current) => {
        const saved = persisted as Partial<UiState> | undefined;
        return { ...current, ...saved, interfaceSize: INTERFACE_SIZES.some(option => option.value === saved?.interfaceSize) ? saved!.interfaceSize! : 125 };
      },
    }
  )
);
