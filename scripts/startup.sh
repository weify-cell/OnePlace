#!/bin/bash
# OnePlace 启动脚本
set -e

cd "$(dirname "$0")/.."

# 加载 nvm（如果存在）
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 启动服务器
exec node server/dist/index.js
