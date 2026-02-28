// 测试脚本：验证 fetchFromAPI 是否正确获取所有市场的 stats

const fs = require('fs');
const path = require('path');

// 读取 cache.json
const cacheFile = path.join(__dirname, 'data', 'cache.json');
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

const markets = data['predict-all-markets-v4']?.value || [];
console.log('\n=== Predict 市场缓存检查 ===');
console.log('总市场数:', markets.length);

// 检查有无 volume 的市场
let withVolume = 0;
let withoutVolume = 0;
const sampleWithVolume = [];
const sampleWithoutVolume = [];

markets.forEach(m => {
  const hasVolume = m.volume || m.volume24h || m.liquidity || m.volumeTotal || m.volume24hUsd || m.totalLiquidity;
  if (hasVolume) {
    withVolume++;
    if (sampleWithVolume.length < 3) {
      sampleWithVolume.push({
        id: m.id,
        title: m.title.slice(0, 40),
        volume: m.volume,
        volume24h: m.volume24h,
        liquidity: m.liquidity
      });
    }
  } else {
    withoutVolume++;
    if (sampleWithoutVolume.length < 3) {
      sampleWithoutVolume.push({
        id: m.id,
        title: m.title.slice(0, 40),
        keys: Object.keys(m).filter(k => k.includes('vol') || k.includes('liq') || k.includes('Vol') || k.includes('Liq'))
      });
    }
  }
});

console.log('\n有 volume 数据的市场:', withVolume);
console.log('无 volume 数据的市场:', withoutVolume);

if (sampleWithVolume.length > 0) {
  console.log('\n有 volume 的市场示例:');
  sampleWithVolume.forEach(m => console.log(' ', m));
}

if (sampleWithoutVolume.length > 0) {
  console.log('\n无 volume 的市场示例:');
  sampleWithoutVolume.forEach(m => console.log(' ', m));
}

// 检查 stats 缓存数量
const statsKeys = Object.keys(data).filter(k => k.startsWith('predict-stats-'));
console.log('\n已缓存的 stats 数量:', statsKeys.length);

// 检查一个 stats 缓存的内容
if (statsKeys.length > 0) {
  const sampleStats = data[statsKeys[0]].value;
  console.log('Stats 缓存示例 (' + statsKeys[0] + '):', JSON.stringify(sampleStats, null, 2));
}

console.log('\n=== 检查完成 ===\n');
