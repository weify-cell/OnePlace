#!/bin/bash
# OnePlace 启动脚本
set -e

cd "$(dirname "$0")/.."

# 加载 nvm（如果存在）
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 编译服务端（如果未编译或源码有更新）
if [ ! -f "server/dist/index.js" ] || [ "server/src/index.ts" -nt "server/dist/index.js" ]; then
  echo "Building server..."
  cd server && npm run build && cd ..
fi

# 启动服务器
exec node server/dist/index.js
