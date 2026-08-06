# ============================================
# 特种设备电梯安全管理AI系统 - CloudBase 部署镜像
# 基础镜像: node:18-bookworm-slim (Debian 12, 小体积 + 兼容性)
# ============================================
FROM node:18-bookworm-slim

# 安装构建工具 (better-sqlite3 需要 C++ 编译)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 先复制 package.json 利用 Docker 缓存
COPY package*.json ./

# 安装依赖 (会自动触发 prebuild/postinstall 重编译 better-sqlite3)
RUN npm install --omit=dev --no-audit --no-fund

# 复制应用代码 (排除 node_modules 和 data.db, 见 .dockerignore)
COPY . .

# 暴露端口 (应用监听 PORT 环境变量, 默认 3000)
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# 启动命令: 首次运行自动初始化数据库, 后续直接启动
CMD ["sh", "-c", "if [ ! -f data.db ]; then echo '🌱 First run, seeding database...'; node seed.js; fi && node server.js"]
