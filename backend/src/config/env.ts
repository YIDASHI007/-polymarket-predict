// 统一的环境变量入口
// 所有外部环境变量必须从这里读取，方便统一校验和类型管理

import dotenv from 'dotenv';

// 在被首次 import 时加载 .env（只会执行一次，幂等）
dotenv.config();

function readString(name: string, defaultValue?: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw;
}

function readInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`[env] Invalid integer for ${name}: "${raw}"`);
  }
  return n;
}

export const env = {
  // Server
  PORT: readInt('PORT', 3001),
  HOST: readString('HOST', '0.0.0.0')!,
  NODE_ENV: readString('NODE_ENV', 'development')!,

  // API keys (optional — 缺失时相关功能会跳过而不是硬编码 fallback)
  PREDICT_FUN_API_KEY: readString('PREDICT_FUN_API_KEY'),
  POLYMARKET_API_KEY: readString('POLYMARKET_API_KEY'),

  // Outbound proxy (for fetching external APIs behind a corporate network)
  HTTPS_PROXY: readString('HTTPS_PROXY') || readString('https_proxy'),
} as const;

/**
 * 启动时日志：打印配置概览（注意脱敏）
 */
export function logEnvSummary(logger: { info: (msg: string) => void; warn: (msg: string) => void }) {
  logger.info(`[env] NODE_ENV=${env.NODE_ENV}, HOST=${env.HOST}, PORT=${env.PORT}`);
  logger.info(
    `[env] PREDICT_FUN_API_KEY=${env.PREDICT_FUN_API_KEY ? maskKey(env.PREDICT_FUN_API_KEY) : '<not set>'}`
  );
  if (env.HTTPS_PROXY) {
    logger.info(`[env] HTTPS_PROXY=${env.HTTPS_PROXY}`);
  }
  if (!env.PREDICT_FUN_API_KEY) {
    logger.warn('[env] PREDICT_FUN_API_KEY is NOT set — Predict.fun scheduled refresh will be skipped.');
  }
}

/**
 * 对 API key 脱敏（仅显示前 8 位）
 */
export function maskKey(key: string): string {
  if (!key) return '<empty>';
  if (key.length <= 8) return '***';
  return `${key.slice(0, 8)}...`;
}
