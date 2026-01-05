module.exports = {
  apps: [
    {
      // Application name
      name: 'eyebot',

      // Script to execute
      script: './dist/index.js',

      // Number of instances (1 for Discord bot to avoid conflicts)
      instances: 1,

      // Execution mode
      exec_mode: 'fork',

      // Auto-restart on crash
      autorestart: true,

      // Watch for file changes (disable in production)
      watch: false,

      // Maximum memory threshold for restart
      max_memory_restart: '1G',

      // Environment variables
      env: {
        NODE_ENV: 'production',
      },

      // Environment variables for development
      env_development: {
        NODE_ENV: 'development',
      },

      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,

      // Merge logs from different instances
      merge_logs: true,

      // Delay between restart attempts (in ms)
      restart_delay: 4000,

      // Min uptime before considering app stable (in ms)
      min_uptime: '10s',

      // Max number of restarts within a specific timeframe
      max_restarts: 10,

      // Timeframe for max_restarts (in ms)
      restart_interval: '1m',

      // Kill timeout
      kill_timeout: 5000,

      // Listen timeout
      listen_timeout: 3000,

      // Graceful shutdown
      shutdown_with_message: false,
    },
  ],
};
