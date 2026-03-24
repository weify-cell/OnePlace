#!/bin/bash
# 启动脚本 - 供 PM2 使用

cd "$(dirname "$0")/.."

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    exit 1
fi

# 检查 dist 目录
if [ ! -d dist ]; then
    echo "Error: dist/ directory not found, run 'npm run build' first"
    exit 1
fi

# 创建必要目录
mkdir -p data logs

# 启动服务
cd server && npx tsx src/index.ts
