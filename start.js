#!/usr/bin/env node
/**
 * 套利监控系统一键启动脚本
 * 支持: Windows / macOS / Linux
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { platform } = process;

// 颜色配置
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTitle() {
  console.log('');
  log('╔══════════════════════════════════════════════════════════╗', 'cyan');
  log('║       Predict.fun × Polymarket 跨市场套利监控系统         ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════╝', 'cyan');
  console.log('');
}

// 检查 Node.js 版本
function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  
  if (major < 18) {
    log(`[×] Node.js 版本过低: ${version}，需要 18+`, 'red');
    process.exit(1);
  }
  
  log(`[√] Node.js 版本: ${version}`, 'green');
}

// 检查目录是否存在
function checkPath(targetPath) {
  return fs.existsSync(targetPath);
}

// 执行命令并返回 Promise
function runCommand(command, cwd, label, color) {
  return new Promise((resolve, reject) => {
    const isWindows = platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/bash';
    const shellFlag = isWindows ? '/c' : '-c';
    
    const proc = spawn(shell, [shellFlag, command], {
      cwd: cwd || process.cwd(),
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    const prefix = label ? `[${label}] ` : '';
    const prefixColored = `${colors[color] || ''}${prefix}${colors.reset}`;
    
    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        console.log(`${prefixColored}${line}`);
      });
    });
    
    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        console.log(`${prefixColored}${colors.red}${line}${colors.reset}`);
      });
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} 进程退出，代码: ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// 安装依赖
async function installDependencies() {
  log('[*] 检查依赖...', 'blue');
  
  const needInstall = [];
  
  if (!checkPath('backend/node_modules')) {
    needInstall.push({ name: '后端', dir: 'backend', cmd: 'npm install' });
  }
  
  if (!checkPath('app/node_modules')) {
    needInstall.push({ name: '前端', dir: 'app', cmd: 'npm install --legacy-peer-deps' });
  }
  
  if (needInstall.length === 0) {
    log('[√] 所有依赖已安装', 'green');
    return;
  }
  
  for (const item of needInstall) {
    log(`[!] ${item.name} 依赖未安装，正在安装...`, 'yellow');
    
    try {
      await runCommand(item.cmd, path.join(process.cwd(), item.dir), item.name, item.name === '后端' ? 'blue' : 'green');
      log(`[√] ${item.name} 依赖安装完成`, 'green');
    } catch (error) {
      log(`[×] ${item.name} 依赖安装失败: ${error.message}`, 'red');
      throw error;
    }
  }
}

// 主函数
async function main() {
  logTitle();
  
  // 检查 Node.js
  checkNodeVersion();
  console.log('');
  
  // 安装依赖
  await installDependencies();
  console.log('');
  
  // 启动服务
  log('[*] 正在启动服务...', 'blue');
  log('    后端: http://localhost:3001');
  log('    前端: http://localhost:5173');
  console.log('');
  log('    按 Ctrl+C 停止所有服务', 'yellow');
  console.log('');
  
  const isWindows = platform === 'win32';
  
  // 启动后端
  const backendProc = spawn(
    isWindows ? 'cmd.exe' : '/bin/bash',
    [isWindows ? '/c' : '-c', 'npm run dev'],
    {
      cwd: path.join(process.cwd(), 'backend'),
      stdio: 'pipe',
      shell: true
    }
  );
  
  // 启动前端
  const frontendProc = spawn(
    isWindows ? 'cmd.exe' : '/bin/bash',
    [isWindows ? '/c' : '-c', 'npm run dev'],
    {
      cwd: path.join(process.cwd(), 'app'),
      stdio: 'pipe',
      shell: true
    }
  );
  
  // 处理后端输出
  backendProc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => console.log(`${colors.blue}[后端]${colors.reset} ${line}`));
  });
  
  backendProc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => console.log(`${colors.blue}[后端]${colors.reset} ${colors.red}${line}${colors.reset}`));
  });
  
  // 处理前端输出
  frontendProc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => console.log(`${colors.green}[前端]${colors.reset} ${line}`));
  });
  
  frontendProc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => console.log(`${colors.green}[前端]${colors.reset} ${colors.red}${line}${colors.reset}`));
  });
  
  // 处理退出
  const cleanup = () => {
    console.log('');
    log('[*] 正在停止服务...', 'blue');
    backendProc.kill('SIGTERM');
    frontendProc.kill('SIGTERM');
    
    setTimeout(() => {
      backendProc.kill('SIGKILL');
      frontendProc.kill('SIGKILL');
      console.log('');
      log('[*] 服务已停止', 'blue');
      process.exit(0);
    }, 2000);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // 保持进程运行
  await new Promise(() => {});
}

// 运行
main().catch((error) => {
  log(`[×] 错误: ${error.message}`, 'red');
  process.exit(1);
});
