// pm2 process supervisor config for the live-trading backend.
//
// Why this exists: on 2026-08-21 the backend (running as a bare `npm run start`
// in a terminal) went silent for ~2h10m with no crash log — the process just
// stopped, most likely the terminal was closed or the machine slept. During
// that window, breakeven-trailing, max-holding-time enforcement, and exchange
// reconciliation were all offline; only the SL/TP orders already resting on
// Binance kept protecting open positions. pm2 daemonizes the process (so it
// survives a closed terminal) and auto-restarts it within seconds of a crash.
//
// Usage:
//   pm2 start ecosystem.config.js   # first start
//   pm2 restart btrad-backend       # after a code change + rebuild
//   pm2 logs btrad-backend          # tail logs
//   pm2 status                      # check it's online
module.exports = {
  apps: [
    {
      name: 'btrad-backend',
      cwd: './backend',
      script: 'dist/main.js',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '15s',
      restart_delay: 3000,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
