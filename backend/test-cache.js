// 测试缓存读写
const fs = require('fs');
const path = require('path');

// 直接读取缓存文件
const cacheFile = path.join(__dirname, 'data', 'cache.json');
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

// 检查 stats 缓存
const statsKeys = Object.keys(data).filter(k => k.startsWith('predict-stats-'));
console.log('Total stats keys:', statsKeys.length);

// 检查市场缓存
const markets = data['predict-all-markets-v4']?.value || [];
console.log('Total markets:', markets.length);

// 检查第一个市场的 stats
const firstId = markets[0]?.id;
console.log('First market ID:', firstId);

const statsKey = `predict-stats-${firstId}`;
const stats = data[statsKey]?.value;
console.log('Stats for first market:', stats);

// 模拟合并逻辑
if (stats) {
  console.log('Would merge:', {
    volume: stats.volumeTotal,
    volume24h: stats.volume24h,
    liquidity: stats.liquidity
  });
}

// 检查多少市场有对应的 stats
let matched = 0;
markets.forEach(m => {
  const key = `predict-stats-${m.id}`;
  if (data[key]) {
    matched++;
  }
});
console.log(`Markets with stats: ${matched}/${markets.length}`);
