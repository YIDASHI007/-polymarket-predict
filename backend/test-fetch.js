// 直接测试 PredictService.fetchFromAPI

require('dotenv').config();
const { createPredictService } = require('./src/services/predictService');

const API_KEY = process.env.PREDICT_FUN_API_KEY || '2969c30f-820c-4daa-bbae-d1cca9d6d5f3';

async function test() {
  console.log('Testing fetchFromAPI with API Key:', API_KEY.slice(0, 8) + '...');
  
  const service = createPredictService(API_KEY);
  
  try {
    const markets = await service.fetchFromAPI();
    console.log('\n=== Results ===');
    console.log('Total markets:', markets.length);
    
    // 检查前5个市场是否有 volume 数据
    const withVolume = markets.filter(m => m.volume > 0).length;
    console.log('Markets with volume:', withVolume);
    
    if (markets.length > 0) {
      const sample = markets[0];
      console.log('\nFirst market:');
      console.log('  ID:', sample.id);
      console.log('  Title:', sample.title);
      console.log('  volume:', sample.volume);
      console.log('  volume24h:', sample.volume24h);
      console.log('  liquidity:', sample.liquidity);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

test();
