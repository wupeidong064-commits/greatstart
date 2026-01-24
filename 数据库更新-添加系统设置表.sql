-- 创建系统设置表
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- 插入默认的最大开班数配置
INSERT INTO settings (key, value, description) 
VALUES ('maxClasses', '20', '场地最大开班数')
ON CONFLICT (key) DO NOTHING;

-- 添加注释
COMMENT ON TABLE settings IS '系统设置表';
COMMENT ON COLUMN settings.key IS '配置键';
COMMENT ON COLUMN settings.value IS '配置值';
COMMENT ON COLUMN settings.description IS '配置说明';
