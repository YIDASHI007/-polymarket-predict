// 验证 fetchFromAPI 修复结果
const fs = require('fs');
const path = require('path');

const cacheFile = path.join(__dirname, 'data', 'cache.json');
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

const markets = data['predict-all-markets-v4']?.value || [];
console.log('\n=== 验证 Predict 市场数据 ===');
console.log('总市场数:', markets.length);

// 检查前10个市场的数据
console.log('\n前10个市场的数据:');
markets.slice(0, 10).forEach((m, i) => {
  console.log(`\n${i + 1}. ${m.title?.slice(0, 40)}...`);
  console.log(`   ID: ${m.id}`);
  console.log(`   volume: ${m.volume}`);
  console.log(`   volume24h: ${m.volume24h}`);
  console.log(`   liquidity: ${m.liquidity}`);
  
  // 检查对应的 stats 缓存
  const stats = data[`predict-stats-${m.id}`]?.value;
  if (stats) {
    console.log(`   → 有 stats 缓存: volume24h=${stats.volume24h}, volumeTotal=${stats.volumeTotal}`);
  } else {
    console.log(`   → 无 stats 缓存`);
  }
});

// 统计
let withVolume = 0;
let withoutVolume = 0;
let withStatsCache = 0;

markets.forEach(m => {
  if (m.volume || m.volume24h || m.liquidity) {
    withVolume++;
  } else {
    withoutVolume++;
  }
  
  if (data[`predict-stats-${m.id}`]) {
    withStatsCache++;
  }
});

console.log('\n=== 统计 ===');
console.log(`有 volume 数据的市场: ${withVolume}/${markets.length}`);
console.log(`无 volume 数据的市场: ${withoutVolume}/${markets.length}`);
console.log(`有 stats 缓存的市场: ${withStatsCache}/${markets.length}`);
console.log('===================\n');
