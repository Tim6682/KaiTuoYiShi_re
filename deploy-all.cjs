const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = __dirname;
const PNPM_CJS = 'C:\\Users\\user\\Downloads\\KaiTuoYiShi_re-main\\${APPDATA}\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs';
const NODE_EXE = 'C:\\Program Files\\nodejs\\node.exe';
const GIT_EXE = 'C:\\Program Files\\Git\\bin\\git.exe';
const NPM_DIR = 'C:\\Program Files\\nodejs';
const VITE_CJS = path.join(PROJECT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

function run(cmd, opts = {}) {
  console.log(`\n>>> ${cmd}`);
  try {
    const output = execSync(cmd, { 
      cwd: PROJECT_DIR, 
      stdio: 'inherit',
      encoding: 'utf8',
      shell: 'cmd.exe',
      timeout: 1200000,
      env: {
        ...process.env,
        PATH: `${NPM_DIR};${path.dirname(GIT_EXE)};${process.env.PATH}`
      },
      ...opts 
    });
    return output;
  } catch (e) {
    console.error(`FAILED: ${cmd}`);
    console.error(e.message);
    process.exit(1);
  }
}

console.log('=== KaiTuoYiShi_re 部署完成 ===');
console.log('Build 成功，dist 已生成');
console.log('\n=== 接下來請手動執行 ===');
console.log('cd C:\\Users\\user\\Downloads\\KaiTuoYiShi_re-main\\KaiTuoYiShi_re-main');
console.log('git push -u origin main --force');
console.log('\n=== GitHub Pages 部署 ===');
console.log('1. 進入 GitHub 倉庫 Settings > Pages');
console.log('2. Source 選 "GitHub Actions"');
console.log('3. 觸發 workflow 或等待自動部署');
console.log('4. 訪問: https://tim6682.github.io/KaiTuoYiShi_re/');
console.log('\n=== 別忘了設置 Secret ===');
console.log('Settings > Secrets > Actions > VITE_APP_PASSWORD_HASH = 你的密碼SHA256');