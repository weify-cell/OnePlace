#!/bin/bash
# OnePlace 一键部署脚本
# 适用于 Ubuntu/Debian 服务器

set -e

PROJECT_DIR="/opt/oneplace"
REPO_URL="YOUR_REPO_URL"  # 替换为你的仓库地址

echo "=== OnePlace 部署开始 ==="

# 1. 安装 Node.js 20
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
    echo "[1/7] 安装 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 2. 安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo "[2/7] 安装 PM2..."
    sudo npm install -g pm2
fi

# 3. 克隆/更新代码
echo "[3/7] 拉取代码..."
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    git pull
else
    sudo mkdir -p "$PROJECT_DIR"
    sudo git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    sudo chown -R $USER:$USER "$PROJECT_DIR"
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
        echo "⚠️ 请编辑 .env 文件，将 JWT_SECRET 修改为随机密钥"
        read -p "按回车键继续..."
    fi
fi

# 6. 创建数据目录
echo "[6/7] 创建数据目录..."
mkdir -p data logs

# 7. 启动服务
echo "[7/7] 启动服务..."
pm2 delete oneplace 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "=== 部署完成 ==="
echo "访问: http://$(curl -s ifconfig.me):3000"
echo "日志: pm2 logs oneplace"
