import { useNavigate, useParams } from 'react-router-dom';
import { Empty } from 'antd';
import { MagneticSurface } from './MagneticSurface';
import { useAuthStore } from '../store/authStore';
import { getUserMenuPermissions, normalizeRole } from '../utils/dataFilter';
import {
  getCategoryById,
  visibleFuncsOfCategory,
} from '../config/iaConfig';

/**
 * 分类功能墙（信息架构 v2）：点侧栏一级大类进入，卡片即功能入口。
 * 只换壳不换页：卡片跳转的都是既有生产路由。
 */
const CategoryWall: React.FC = () => {
  const { catId } = useParams<{ catId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const permissions = getUserMenuPermissions();
  const role = user?.role ? normalizeRole(user.role) : null;
  const category = getCategoryById(catId || '');
  const funcs = category ? visibleFuncsOfCategory(category.id, permissions, role) : [];

  if (!category || funcs.length === 0) {
    return <Empty description="该分类不存在或当前角色无可见功能" style={{ marginTop: 80 }} />;
  }

  return (
    <div>
      <div className="bz-page-head">
        <h1>
          <span className="bz-func-icon" style={{ marginRight: 10, verticalAlign: -3 }}>
            {category.icon}
          </span>
          {role === 'coach' && category.coachName ? category.coachName : category.name}
        </h1>
        <p>{category.desc} · 点击卡片进入对应功能</p>
      </div>
      <div className="bz-card-grid">
        {funcs.map((f) => (
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
              {role === 'coach' && f.coachName ? f.coachName : f.name}
            </span>
            <span className="bz-func-desc">{f.desc}</span>
          </MagneticSurface>
        ))}
      </div>
    </div>
  );
};

export default CategoryWall;
