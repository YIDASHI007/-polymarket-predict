// Predict API 测试脚本
// 测试：获取市场列表 + stats 数据（volume/liquidity）
//
// 使用方法：
//   1. 在 backend/.env 中设置 PREDICT_FUN_API_KEY
//   2. node test-predict-api.js

require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.PREDICT_FUN_API_KEY;
const BASE_URL = 'https://api.predict.fun/v1';

if (!API_KEY) {
  console.error('❌ PREDICT_FUN_API_KEY is not set.');
  console.error('   Please configure it in backend/.env before running this test.');
  process.exit(1);
}

// 创建带认证 header 的 axios 实例
const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'x-api-key': API_KEY,
    'Accept': 'application/json',
  },
  timeout: 30000,
});

// 主测试函数
async function testPredictAPI() {
  console.log('=== Predict API 测试开始 ===\n');
  console.log('API Key:', API_KEY.slice(0, 8) + '...');
  console.log('');

  try {
    // 1. 获取市场列表
    console.log('1. 获取市场列表...');
    const marketsResponse = await client.get('/markets?first=10&status=OPEN');

    const markets = marketsResponse.data?.data || marketsResponse.data || [];
    console.log(`   ✓ 获取到 ${markets.length} 个市场\n`);

    if (markets.length === 0) {
      console.log('❌ 没有获取到市场数据');
      return;
    }

    // 打印第一个市场的基本信息
    const firstMarket = markets[0];
    console.log('2. 第一个市场信息：');
    console.log('   ID:', firstMarket.id);
    console.log('   Title:', firstMarket.title);
    console.log('   Status:', firstMarket.status);
    console.log('');

    // 2. 获取单个市场的 stats 数据
    console.log('3. 获取 stats 数据（volume/liquidity）...');
    const statsResponse = await client.get(`/markets/${firstMarket.id}/stats`);

    const stats = statsResponse.data?.data || statsResponse.data;
    console.log('   ✓ Stats 返回:', JSON.stringify(stats, null, 2));
    console.log('');

    // 3. 提取 volume/liquidity
    console.log('4. 提取关键数据：');
    const volume24h = stats?.volume24hUsd || stats?.volume24h || 0;
    const volumeTotal = stats?.volumeTotalUsd || stats?.volumeTotal || 0;
    const liquidity = stats?.totalLiquidityUsd || stats?.liquidity || 0;

    console.log('   volume24h:', volume24h);
    console.log('   volumeTotal:', volumeTotal);
    console.log('   liquidity:', liquidity);
    console.log('');

    if (volumeTotal > 0 || liquidity > 0) {
      console.log('✅ SUCCESS: API 可以返回 volume/liquidity 数据！');
    } else {
      console.log('⚠️ WARNING: Stats 返回了，但 volume/liquidity 为 0');
      console.log('   可能这个市场确实没有交易数据');
    }

    // 4. 测试批量获取多个市场的 stats
    console.log('\n5. 测试批量获取前 5 个市场的 stats...');
    const testMarkets = markets.slice(0, 5);

    for (const market of testMarkets) {
      try {
        const s = await client.get(`/markets/${market.id}/stats`);
        const sData = s.data?.data || s.data;
        const v = sData?.volumeTotalUsd || sData?.volumeTotal || 0;
        const l = sData?.totalLiquidityUsd || sData?.liquidity || 0;
        console.log(`   [${market.id}] ${market.title.slice(0, 30)}... | Volume: ${v}, Liquidity: ${l}`);
      } catch (e) {
        console.log(`   [${market.id}] Error: ${e.response?.status || e.message}`);
      }

      // 延迟 250ms 避免速率限制
      await new Promise((r) => setTimeout(r, 250));
    }

    console.log('\n=== 测试完成 ===');
  } catch (error) {
    console.error('❌ ERROR:', error.response?.status, error.response?.data || error.message);

    if (error.response?.status === 401) {
      console.error('\n   API Key 无效或已过期');
    } else if (error.response?.status === 429) {
      console.error('\n   触发速率限制，请稍后再试');
    }
  }
}

// 执行测试
testPredictAPI();
