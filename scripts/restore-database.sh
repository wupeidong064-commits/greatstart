#!/bin/bash
# ==================================================
# 数据库恢复脚本
# ==================================================
# 用法: ./scripts/restore-database.sh <backup_file>
# 示例: ./scripts/restore-database.sh backups/buzzer_backup_20250101_020000.sql.gz
# ==================================================

set -e

# 检查参数
if [ -z "$1" ]; then
    echo "用法: $0 <backup_file>"
    echo "示例: $0 backups/buzzer_backup_20250101_020000.sql.gz"
    exit 1
fi

BACKUP_FILE=$1

# 检查备份文件是否存在
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "错误: 备份文件不存在: ${BACKUP_FILE}"
    exit 1
fi

# 从 .env 文件读取数据库配置
if [ -f "./backend/.env" ]; then
    export $(grep -v '^#' ./backend/.env | xargs)
elif [ -f "./.env" ]; then
    export $(grep -v '^#' ./.env | xargs)
fi

# 检查数据库连接配置
if [ -z "${DATABASE_URL}" ]; then
    echo "错误: DATABASE_URL 未配置"
    exit 1
fi

# 解析 DATABASE_URL
DB_HOST=$(echo ${DATABASE_URL} | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo ${DATABASE_URL} | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo ${DATABASE_URL} | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo ${DATABASE_URL} | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo ${DATABASE_URL} | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

echo "=================================================="
echo "数据库恢复脚本"
echo "=================================================="
echo "目标数据库主机: ${DB_HOST}"
echo "目标数据库端口: ${DB_PORT}"
echo "目标数据库名称: ${DB_NAME}"
echo "备份文件: ${BACKUP_FILE}"
echo ""
echo "警告: 此操作将覆盖当前数据库中的数据！"
read -p "确认要继续吗？(yes/no): " confirm

if [ "${confirm}" != "yes" ]; then
    echo "操作已取消"
    exit 0
fi

# 解压（如果是 .gz 文件）
if [[ "${BACKUP_FILE}" == *.gz ]]; then
    echo "解压备份文件..."
    TEMP_SQL=$(mktemp /tmp/buzzer_restore_XXXXXX.sql)
    gunzip -c "${BACKUP_FILE}" > "${TEMP_SQL}"
    SQL_FILE="${TEMP_SQL}"
else
    SQL_FILE="${BACKUP_FILE}"
fi

# 执行恢复
echo "正在恢复数据库..."
PGPASSWORD="${DB_PASS}" psql \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -f "${SQL_FILE}"

# 清理临时文件
if [ -n "${TEMP_SQL}" ] && [ -f "${TEMP_SQL}" ]; then
    rm "${TEMP_SQL}"
fi

echo ""
echo "=================================================="
echo "数据库恢复完成: $(date)"
echo "=================================================="
