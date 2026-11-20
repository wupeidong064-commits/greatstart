import { useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { Modal } from './overlays';
import { Check as CheckOutlined, Plus as PlusOutlined } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { getUserMenuPermissions, normalizeRole } from '../utils/dataFilter';
import { CATEGORIES, visibleFuncsOfCategory, type FuncDef } from '../config/iaConfig';

/**
 * 管理常用功能弹窗（复刻原型样式：双列 pick 网格 + 完成按钮）。
 * 首页与「常用功能」页共用同一份收藏状态（uiStore）与同一交互：
 * 点选即暂存，完成落盘；同一功能不会重复添加；取消不丢失原收藏。
 */
interface Props {
  open: boolean;
  onClose: () => void;
}

const FavoritesManageModal: React.FC<Props> = ({ open, onClose }) => {
  const { user } = useAuthStore();
  const favorites = useUiStore((s) => s.favorites);
  const toggleFavorite = useUiStore((s) => s.toggleFavorite);
  const [draft, setDraft] = useState<string[]>(favorites);

  useEffect(() => {
    if (open) setDraft(favorites);
  }, [open, favorites]);

  const permissions = useMemo(() => getUserMenuPermissions(), []);
  const role = user?.role ? normalizeRole(user.role) : null;

  const groups = useMemo(
    () =>
      CATEGORIES.map((cat) => ({
        cat,
        funcs: visibleFuncsOfCategory(cat.id, permissions, role).filter((f): f is FuncDef => Boolean(f)),
      })).filter((g) => g.funcs.length > 0),
    [permissions, role]
  );

  const pick = (id: string) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = () => {
    // 逐项对齐 uiStore（toggle 自带去重语义），再关闭
    favorites.filter((id) => !draft.includes(id)).forEach((id) => toggleFavorite(id));
    draft.filter((id) => !favorites.includes(id)).forEach((id) => toggleFavorite(id));
    onClose();
  };

  return (
    <Modal title="管理常用功能" open={open} onCancel={onClose} width={640}
      footer={<><Button onClick={onClose}>取消</Button><Button type="primary" onClick={save}>完成</Button></>}>
        <div className="overlay-favorites-grid">
          {groups.flatMap(({ cat, funcs }) =>
            funcs.map((f) => {
              const on = draft.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`wb-pick${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => pick(f.id)}
                >
                  {on ? <CheckOutlined size={16} /> : <PlusOutlined size={16} />}
                  <span>{role === 'coach' && f.coachName ? f.coachName : f.name}</span>
                  <span className="cat">{cat.name}</span>
                </button>
              );
            })
          )}
          {groups.length === 0 && (
            <div className="wb-empty" style={{ gridColumn: '1 / -1' }}>
              当前角色暂无可添加的功能
            </div>
          )}
        </div>
    </Modal>
  );
};

export default FavoritesManageModal;
