module.exports = {
  apps: [
    {
      name: 'oneplace',
      script: './scripts/startup.sh',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // 日志配置
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // 自动重启配置
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 3000,
      // 内存限制
      max_memory_restart: '500M',
      // 崩溃时自动重启
      autorestart: true,
      // 不随 PM2 重启而重启（避免无限循环）
      pmx: false,
      // 监听文件变化（生产环境关闭）
      watch: false,
      // 忽略的文件
      ignore_watch: ['node_modules', 'logs', 'data', '.git']
    }
  ]
}
