-- ==================================================
-- 创建 settings 表
-- 在 MemFire SQL 编辑器中执行此脚本
-- ==================================================

-- 创建 settings 表
CREATE TABLE IF NOT EXISTS settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    "organizationId" UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(key, "organizationId")
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_settings_organization ON settings("organizationId");

-- 启用 RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略
CREATE POLICY "Settings are viewable by users in the same organization" ON settings
    FOR SELECT
    USING (
        "organizationId" IN (
            SELECT id FROM organizations
            WHERE id = (SELECT "organizationId" FROM users WHERE id = auth.uid())
        )
    );

CREATE POLICY "Settings are manageable by admin and manager" ON settings
    FOR ALL
    USING (
        "organizationId" IN (
            SELECT "organizationId" FROM users
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 添加注释
COMMENT ON TABLE settings IS '系统设置表，按机构存储配置';
COMMENT ON COLUMN settings.key IS '设置项的键';
COMMENT ON COLUMN settings.value IS '设置项的值';
COMMENT ON COLUMN settings."organizationId" IS '所属机构ID';
