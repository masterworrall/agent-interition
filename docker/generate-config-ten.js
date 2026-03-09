const fs = require('fs');
const path = require('path');

const telegramUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
if (!telegramUserId) {
  console.error('Error: TELEGRAM_ALLOWED_USER_ID is not set');
  process.exit(1);
}

const baseDir = '/home/node/.openclaw';
const dirs = ['workspace/skills', 'cron', 'canvas', 'credentials'];
for (const dir of dirs) {
  fs.mkdirSync(path.join(baseDir, dir), { recursive: true });
}
fs.mkdirSync('/home/node/.interition', { recursive: true });
console.log('[init-ten] Directories created');

const config = {
  gateway: {
    mode: 'local',
    bind: 'lan',
    port: 18800,
    controlUi: {
      allowInsecureAuth: true,
      allowedOrigins: ['http://localhost:18800']
    }
  },
  cron: {
    enabled: true,
    maxConcurrentRuns: 1
  },
  channels: {
    telegram: {
      dmPolicy: 'allowlist',
      allowFrom: [telegramUserId]
    }
  }
};

const outputPath = process.argv[2] || '/home/node/.openclaw/openclaw.json';
fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + '\n');
console.log('[init-ten] Config written to ' + outputPath);

const { execSync } = require('child_process');
execSync('chown -R 1000:1000 /home/node/.openclaw /home/node/.interition');
console.log('[init-ten] Volume permissions set for uid 1000');
