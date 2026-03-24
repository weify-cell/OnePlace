#!/bin/bash
# OnePlace 一键部署脚本（服务器版本）
# 部署目录: /soft/oneplace

set -e

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

PROJECT_DIR="/soft/oneplace"
REPO_URL="https://github.com/weify-cell/OnePlace.git"

echo "=== OnePlace 部署开始 ==="
echo "部署目录: $PROJECT_DIR"
echo "Node版本: $(node -v)"
echo ""

# 1. 检查 PM2
echo "[1/3] 检查 PM2..."
pm2 -v

# 2. 克隆/更新代码
echo "[2/3] 拉取代码..."
if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR"
    git pull origin master
else
    # 如果目录存在但不是git仓库，清空后重新克隆
    if [ -d "$PROJECT_DIR" ] && [ "$(ls -A $PROJECT_DIR 2>/dev/null)" ]; then
        echo "目录已存在但不是git仓库，正在清空..."
        rm -rf "$PROJECT_DIR"/* "$PROJECT_DIR"/.[^.]* 2>/dev/null || true
    fi
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# 3. 安装依赖并构建
echo "[3/3] 安装依赖并构建..."
npm run install:all
npm run build

# 4. 配置环境变量
echo "配置环境变量..."
if [ ! -f .env ]; then
    if [ -f .env.production ]; then
        cp .env.production .env
        echo "⚠️  警告: 请编辑 .env 文件，将 JWT_SECRET 修改为随机密钥"
        echo "    生成命令: openssl rand -base64 32"
    fi
fi

# 5. 创建数据目录
echo "创建数据目录..."
mkdir -p data logs

# 6. 启动服务
echo "启动服务..."
pm2 delete oneplace 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "=== 部署完成 ==="
echo "访问: http://192.168.1.9:3000"
echo "日志: pm2 logs oneplace"
echo ""
echo "⚠️  重要: 请检查 .env 文件中的 JWT_SECRET 是否已修改为随机密钥！"
