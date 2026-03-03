-- 添加 source 列到 leads 表
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text;

-- 添加注释
COMMENT ON COLUMN leads.source IS '线索来源：meituan(美团), groundPromotion(地推), telemarketing(电销), walkIn(上门), referral(转介绍), crossIndustry(异业)';
