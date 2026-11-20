import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty } from 'antd';
import { SlidersHorizontal as SettingOutlined } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { getUserMenuPermissions, normalizeRole } from '../utils/dataFilter';
import {
  getFuncById,
  commonFunctions,
  type FuncDef,
} from '../config/iaConfig';
import FavoritesManageModal from '../components/FavoritesManageModal';
import { MagneticSurface } from '../components/MagneticSurface';

/** 高频业务入口与个人收藏在此汇合，已收藏的同一路径只显示一次。 */
const FavoritesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const favorites = useUiStore((s) => s.favorites);
  const [manageOpen, setManageOpen] = useState(false);

  const permissions = useMemo(() => getUserMenuPermissions(), [user]);
  const role = user?.role ? normalizeRole(user.role) : null;
  const job = user?.jobRole ?? user?.role;
  const teacher = job === 'teacher' || job === 'coach';
  const sales = job === 'sales';

  const businessIds = [
    ...(teacher ? ['classes', 'weeklySchedule'] : []),
    ...(teacher || sales ? ['pool', 'experience', 'orderinfo', 'renewal'] : []),
  ];
  const businessFuncs = businessIds.map(getFuncById)
    .filter((f): f is FuncDef => Boolean(f) && f!.visible(permissions, role));
  const businessPaths = new Set(businessFuncs.map(f => f.path));
  const combined = commonFunctions(favorites, permissions, role, job);
  const businessLabels: Record<string, { name: string; desc: string }> = {
    classes: { name: '我的班级', desc: '查看负责班级和学员' },
    weeklySchedule: { name: '我的课程与签到', desc: '查看课表并选择场次签到划课' },
    pool: { name: '客户跟进', desc: '查看负责客户和跟进记录' },
    experience: { name: '体验课安排', desc: '查看与登记体验课进度' },
    orderinfo: { name: '新签登记', desc: '进入成单信息登记业务' },
    renewal: { name: '续费跟进', desc: '查看待续费学员并处理续费' },
  };

  return (
    <div>
      <div className="bz-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1>常用功能</h1>
          <p>{teacher || sales ? '常用业务与个人收藏都在这里。点「管理」调整个人收藏。' : '你自己挑的高频入口。点「管理」勾选或取消，随时调整；移除不影响功能本身。'}</p>
        </div>
        <Button icon={<SettingOutlined />} onClick={() => setManageOpen(true)}>
          管理
        </Button>
      </div>

      {combined.length === 0 ? (
        <Empty
          description={
            <span style={{ color: 'var(--tx2)' }}>
              还没有常用功能。点右上角「管理」，从功能清单里勾选你要的入口。
            </span>
          }
          style={{ marginTop: 80 }}
        >
          <Button type="primary" onClick={() => setManageOpen(true)}>
            去添加
          </Button>
        </Empty>
      ) : (
        <div className="bz-card-grid">
          {combined.map((f) => (
            <MagneticSurface
              key={f.id}
              role="button"
              tabIndex={0}
              className="bz-func-card"
              onClick={() => navigate(f.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(f.path);
                }
              }}
            >
              <span className="bz-func-icon">{f.icon}</span>
              <span className="bz-func-name">
                {(businessPaths.has(f.path) && businessLabels[f.id]?.name) || (role === 'coach' && f.coachName ? f.coachName : f.name)}
              </span>
              <span className="bz-func-desc">{(businessPaths.has(f.path) && businessLabels[f.id]?.desc) || f.desc}</span>
            </MagneticSurface>
          ))}
        </div>
      )}

      <FavoritesManageModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
};

export default FavoritesPage;
