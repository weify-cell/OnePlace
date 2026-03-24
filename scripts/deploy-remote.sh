#!/bin/bash
# OnePlace 一键部署脚本（服务器版本）
# 部署目录: /soft/oneplace

set -e

PROJECT_DIR="/soft/oneplace"
REPO_URL="https://github.com/weify-cell/OnePlace.git"

echo "=== OnePlace 部署开始 ==="
echo "部署目录: $PROJECT_DIR"
echo ""

# 0. 创建部署目录
sudo mkdir -p "$PROJECT_DIR"
sudo chown -R $USER:$USER "$PROJECT_DIR"

# 1. 安装 Node.js 20
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
    echo "[1/7] 安装 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[1/7] Node.js 已安装: $(node -v)"
fi

# 2. 安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo "[2/7] 安装 PM2..."
    sudo npm install -g pm2
else
    echo "[2/7] PM2 已安装"
fi

# 3. 克隆/更新代码
echo "[3/7] 拉取代码..."
if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR"
    git pull origin master
else
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# 4. 安装依赖并构建
echo "[4/7] 安装依赖并构建..."
npm run install:all
npm run build

# 5. 配置环境变量
echo "[5/7] 配置环境变量..."
if [ ! -f .env ]; then
    if [ -f .env.production ]; then
        cp .env.production .env
        echo "⚠️  警告: 请编辑 .env 文件，将 JWT_SECRET 修改为随机密钥"
        echo "    生成命令: openssl rand -base64 32"
    fi
fi

# 6. 创建数据目录
echo "[6/7] 创建数据目录..."
mkdir -p data logs

# 7. 启动服务
echo "[7/7] 启动服务..."
pm2 delete oneplace 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "=== 部署完成 ==="
echo "访问: http://192.168.1.9:3000"
echo "日志: pm2 logs oneplace"
echo ""
echo "⚠️  重要: 请检查 .env 文件中的 JWT_SECRET 是否已修改为随机密钥！"
