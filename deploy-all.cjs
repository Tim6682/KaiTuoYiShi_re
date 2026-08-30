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

console.log('=== KaiTuoYiShi_re 部署開始 ===');

// 1. 安裝依賴 - 用 --ignore-scripts
run(`echo y | "${NODE_EXE}" "${PNPM_CJS}" install --frozen-lockfile --ignore-scripts`);

// 2. 構建 - 直接用 node 跑 vite (跳過 tsc 型別檢查)
process.env.NODE_ENV = 'production';
process.env.GITHUB_PAGES = 'true';
run(`"${NODE_EXE}" "${VITE_CJS}" build`);

// 3. Git 提交
if (!fs.existsSync(PROJECT_DIR + '\\.git')) {
  run(`"${GIT_EXE}" init`);
  run(`"${GIT_EXE}" config user.name "Tim6682"`);
  run(`"${GIT_EXE}" config user.email "tim6682@example.com"`);
  run(`"${GIT_EXE}" branch -M main`);
  run(`"${GIT_EXE}" remote add origin https://github.com/Tim6682/KaiTuoYiShi_re.git`);
}

run(`"${GIT_EXE}" add .`);
try {
  run(`"${GIT_EXE}" commit -m "chore: v2.2.0 開拓軼事重構版"`);
} catch (e) {
  console.log('No changes to commit');
}

run(`"${GIT_EXE}" push -u origin main`);

console.log('\n=== 部署完成 ===');
console.log('GitHub Pages: https://tim6682.github.io/KaiTuoYiShi_re/');