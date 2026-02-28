// 格式化工具函数

/**
 * 格式化价格为货币格式
 */
export function formatPrice(price: number, currency: string = 'USD'): string {
  // 确保是数字
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (numPrice === null || numPrice === undefined || isNaN(numPrice)) return '--';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numPrice);
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, decimals: number = 2): string {
  // 确保是数字
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (numValue === null || numValue === undefined || isNaN(numValue)) return '--';
  
  const sign = numValue >= 0 ? '+' : '';
  return `${sign}${(numValue * 100).toFixed(decimals)}%`;
}

/**
 * 格式化交易量（智能单位）
 */
export function formatVolume(value: number | string): string {
  // 确保是数字
  let numValue: number;
  if (typeof value === 'string') {
    numValue = parseFloat(value);
  } else {
    numValue = value;
  }
  
  if (numValue === null || numValue === undefined || isNaN(numValue)) return '--';
  
  if (numValue >= 1_000_000) {
    return `$${(numValue / 1_000_000).toFixed(1)}M`;
  } else if (numValue >= 1_000) {
    return `$${(numValue / 1_000).toFixed(1)}K`;
  }
  return `$${numValue.toFixed(0)}`;
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}天前`;
  
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

/**
 * 格式化倒计时
 */
export function formatCountdown(endDate: string): string {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const diff = end - now;
  
  if (diff <= 0) return '已结束';
  
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  
  if (days > 0) return `${days}天 ${hours}小时`;
  return `${hours}小时`;
}

/**
 * 格式化日期时间
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 获取套利等级
 */
export function getArbitrageLevel(roi: number): 'high' | 'medium' | 'low' | 'micro' {
  // 确保是数字
  const numRoi = typeof roi === 'string' ? parseFloat(roi) : roi;
  if (numRoi === null || numRoi === undefined || isNaN(numRoi)) return 'micro';
  
  if (numRoi >= 0.15) return 'high';
  if (numRoi >= 0.05) return 'medium';
  if (numRoi >= 0.02) return 'low';
  return 'micro';
}

/**
 * 获取套利等级样式
 */
export function getArbitrageLevelStyles(level: 'high' | 'medium' | 'low' | 'micro'): {
  borderColor: string;
  bgColor: string;
  textColor: string;
  label: string;
} {
  switch (level) {
    case 'high':
      return {
        borderColor: 'border-red-500',
        bgColor: 'bg-red-50 dark:bg-red-950/30',
        textColor: 'text-red-600 dark:text-red-400',
        label: '高利润',
      };
    case 'medium':
      return {
        borderColor: 'border-orange-500',
        bgColor: 'bg-orange-50 dark:bg-orange-950/30',
        textColor: 'text-orange-600 dark:text-orange-400',
        label: '中利润',
      };
    case 'low':
      return {
        borderColor: 'border-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
        textColor: 'text-yellow-600 dark:text-yellow-400',
        label: '低利润',
      };
    case 'micro':
      return {
        borderColor: 'border-gray-300',
        bgColor: 'bg-gray-50 dark:bg-gray-900',
        textColor: 'text-gray-500 dark:text-gray-400',
        label: '微利润',
      };
  }
}

/**
 * 获取平台名称
 */
export function getPlatformName(platform: 'predict' | 'polymarket'): string {
  return platform === 'predict' ? 'Predict.fun' : 'Polymarket';
}

/**
 * 获取平台颜色
 */
export function getPlatformColor(platform: 'predict' | 'polymarket'): string {
  return platform === 'predict' 
    ? 'text-emerald-600 dark:text-emerald-400' 
    : 'text-purple-600 dark:text-purple-400';
}

/**
 * 获取平台背景色
 */
export function getPlatformBgColor(platform: 'predict' | 'polymarket'): string {
  return platform === 'predict' 
    ? 'bg-emerald-100 dark:bg-emerald-900/30' 
    : 'bg-purple-100 dark:bg-purple-900/30';
}

/**
 * 获取置信度标签
 */
export function getConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  const labels = {
    high: '高置信度',
    medium: '中置信度',
    low: '低置信度',
  };
  return labels[confidence];
}

/**
 * 获取置信度颜色
 */
export function getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
  const colors = {
    high: 'text-green-600 dark:text-green-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    low: 'text-red-600 dark:text-red-400',
  };
  return colors[confidence];
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength) + '...';
}
