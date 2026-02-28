#!/bin/bash
# ==================================================
# 数据库备份脚本
# ==================================================
# 用法: ./scripts/backup-database.sh
#
# 建议配置 crontab 定期执行:
# 每天凌晨 2 点备份: 0 2 * * * /path/to/backup-database.sh
# ==================================================

set -e

# 配置
BACKUP_DIR="./backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/buzzer_backup_${TIMESTAMP}.sql"

# 从 .env 文件读取数据库配置
if [ -f "./backend/.env" ]; then
    export $(grep -v '^#' ./backend/.env | xargs)
elif [ -f "./.env" ]; then
    export $(grep -v '^#' ./.env | xargs)
fi

# 创建备份目录
mkdir -p ${BACKUP_DIR}

echo "=================================================="
echo "开始备份数据库: $(date)"
echo "=================================================="

# 检查数据库连接配置
if [ -z "${DATABASE_URL}" ]; then
    echo "错误: DATABASE_URL 未配置"
    exit 1
fi

# 解析 DATABASE_URL
# 格式: postgresql://username:password@host:port/database
DB_HOST=$(echo ${DATABASE_URL} | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo ${DATABASE_URL} | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo ${DATABASE_URL} | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo ${DATABASE_URL} | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo ${DATABASE_URL} | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

echo "数据库主机: ${DB_HOST}"
echo "数据库端口: ${DB_PORT}"
echo "数据库名称: ${DB_NAME}"

# 执行备份
echo "正在备份数据库..."
PGPASSWORD="${DB_PASS}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -F p \
    -f "${BACKUP_FILE}" \
    --no-owner \
    --no-acl

# 压缩备份文件
echo "压缩备份文件..."
gzip "${BACKUP_FILE}"
BACKUP_FILE="${BACKUP_FILE}.gz"

# 计算文件大小
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "备份文件大小: ${BACKUP_SIZE}"
echo "备份文件路径: ${BACKUP_FILE}"

# 清理旧备份
echo "清理 ${RETENTION_DAYS} 天前的旧备份..."
find ${BACKUP_DIR} -name "buzzer_backup_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete

# 列出当前备份
echo ""
echo "当前备份列表:"
ls -lh ${BACKUP_DIR}/buzzer_backup_*.sql.gz 2>/dev/null || echo "无备份文件"

echo ""
echo "=================================================="
echo "备份完成: $(date)"
echo "=================================================="

# 可选：上传到云存储（需要配置）
# if [ -n "${BACKUP_S3_BUCKET}" ]; then
#     echo "上传到 S3..."
#     aws s3 cp "${BACKUP_FILE}" "s3://${BACKUP_S3_BUCKET}/backups/"
# fi
