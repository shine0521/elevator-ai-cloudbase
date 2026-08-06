#!/bin/sh
# CloudBase 部署启动脚本
# - 首次运行自动初始化 SQLite 数据库
# - 使用 PORT 环境变量 (CloudBase 默认传入 3000)
set -e

cd /app

# 检查数据库是否存在
if [ ! -f data.db ]; then
  echo "🌱 首次运行, 正在初始化数据库..."
  node seed.js
  echo "✅ 数据库初始化完成"
else
  echo "✅ 数据库已存在, 跳过初始化"
fi

# 启动 Express 服务器
exec node server.js
