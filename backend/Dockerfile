# ==================================================
# Buzzer Backend Dockerfile
# ==================================================

# 构建阶段
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 显式生成与 Linux 镜像匹配的 Prisma Client，再编译 TypeScript
RUN npx prisma generate && npm run build

# 手动运行的一次性迁移镜像（不 seed、不使用 migrate dev）
FROM builder AS migration
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

FROM builder AS production-deps
RUN npm prune --omit=dev

# 生产阶段
FROM node:20-alpine AS production
ENV NODE_ENV=production
RUN apk add --no-cache openssl

WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 复制构建产物
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=production-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/scripts/start-production.cjs ./scripts/start-production.cjs

RUN mkdir -p /app/logs /app/storage/ai-reports && chown -R nodejs:nodejs /app/logs /app/storage

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# 启动命令
CMD ["node", "scripts/start-production.cjs"]
