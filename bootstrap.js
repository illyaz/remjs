const child_process = require('child_process');

child_process.execSync('npm run build', {
  stdio: 'inherit',
});

import('./dist/main.js');
