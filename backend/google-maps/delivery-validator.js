/**
 * 白马有机果蔬农场 - 配送范围验证服务
 * 判断用户地址是否在配送范围内，计算配送费用
 * 支持城市：金边(15km) / 西哈努克(10km) / 暹粒(10km) / 马德望(8km)
 * 版本：1.0.0
 */

// ============================================================
// 配送区域配置
// ============================================================

const DELIVERY_ZONES = [
  {
    city: 'phnompenh',
    cityName: '金边',
    cityNameEn: 'Phnom Penh',
    center: [11.5564, 104.9282],
    radius: 15,         // km
    radiusMeters: 15000,
    active: true,       // 已开通
    avgSpeedKmh: 25,    // 平均配送速度 km/h
    baseTime: 10        // 基础准备时间（分钟）
  },
  {
    city: 'sihanoukville',
    cityName: '西哈努克',
    cityNameEn: 'Sihanoukville',
    center: [10.6257, 103.5235],
    radius: 10,
    radiusMeters: 10000,
    active: true,
    avgSpeedKmh: 30,
    baseTime: 10
  },
  {
    city: 'siemreap',
    cityName: '暹粒',
    cityNameEn: 'Siem Reap',
    center: [13.3633, 103.8560],
    radius: 10,
    radiusMeters: 10000,
    active: false,      // 即将开通
    avgSpeedKmh: 25,
    baseTime: 10
  },
  {
    city: 'battambang',
    cityName: '马德望',
    cityNameEn: 'Battambang',
    center: [13.0957, 103.2022],
    radius: 8,
    radiusMeters: 8000,
    active: false,      // 即将开通
    avgSpeedKmh: 25,
    baseTime: 10
  }
];

// 配送费用配置
const DELIVERY_FEE_CONFIG = {
  tiers: [
    { maxDistance: 5000, fee: 2.0 },      // ≤5km: $2
    { maxDistance: 10000, fee: 3.0 },     // 5-10km: $3
    { maxDistance: 15000, fee: 4.0 },     // 10-15km: $4
    { maxDistance: Infinity, fee: 5.0 }   // >15km: $5（但不在范围内）
  ],
  freeShippingThreshold: 30.0,            // 满$30免运费
  currency: 'USD',
  currencySymbol: '$'
};

// ============================================================
// Haversine公式 - 计算两点间距离
// ============================================================

/**
 * 将角度转换为弧度
 * @param {number} deg - 角度
 * @returns {number} 弧度
 */
function toRadians(deg) {
  return deg * (Math.PI / 180);
}

/**
 * 使用Haversine公式计算两点间距离
 * @param {number} lat1 - 点1纬度
 * @param {number} lng1 - 点1经度
 * @param {number} lat2 - 点2纬度
 * @param {number} lng2 - 点2经度
 * @returns {number} 距离（米）
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 地球半径（米）
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * 批量计算多个点到中心点的距离
 * @param {Array<{lat:number,lng:number}>} points - 点数组
 * @param {Array<number>} center - 中心坐标 [lat, lng]
 * @returns {Array<{point:Object, distance:number}>}
 */
function batchCalculateDistances(points, center) {
  return points.map(point => ({
    point,
    distance: haversineDistance(center[0], center[1], point.lat, point.lng)
  }));
}

// ============================================================
// 配送范围验证
// ============================================================

/**
 * 验证坐标是否在指定城市的配送范围内
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @param {string} city - 城市代码（phnompenh/sihanoukville/siemreap/battambang）
 * @returns {{
 *   inRange: boolean,
 *   distance: number,
 *   distanceKm: string,
 *   distanceMi: string,
 *   city: string,
 *   cityName: string,
 *   estimatedTime: number,
 *   estimatedTimeText: string,
 *   active: boolean,
 *   message: string
 * }}
 */
function validateDeliveryZone(lat, lng, city) {
  // 参数验证
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('[DeliveryValidator] 经纬度必须为数字');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('[DeliveryValidator] 经纬度超出有效范围');
  }

  // 查找城市配送区域
  const zone = DELIVERY_ZONES.find(z => z.city === city);
  if (!zone) {
    throw new Error(`[DeliveryValidator] 未知城市: ${city}。可选: phnompenh, sihanoukville, siemreap, battambang`);
  }

  // 计算距离
  const distanceMeters = haversineDistance(lat, lng, zone.center[0], zone.center[1]);
  const distanceKm = distanceMeters / 1000;
  const inRange = distanceMeters <= zone.radiusMeters;

  // 估算配送时间
  const travelTimeMinutes = Math.round((distanceKm / zone.avgSpeedKmh) * 60);
  const estimatedTime = zone.baseTime + travelTimeMinutes;

  // 生成消息
  let message;
  if (!zone.active) {
    message = `${zone.cityName}（${zone.cityNameEn}）即将开通配送服务，敬请期待！`;
  } else if (inRange) {
    message = `您的地址在${zone.cityName}配送范围内，距离约${distanceKm.toFixed(1)}km，预计${estimatedTime}分钟送达`;
  } else {
    message = `您的地址超出${zone.cityName}配送范围（${zone.radius}km），最近门店距离约${distanceKm.toFixed(1)}km`;
  }

  return {
    inRange: inRange && zone.active,
    distance: distanceMeters,
    distanceKm: distanceKm.toFixed(2),
    distanceMi: (distanceKm * 0.621371).toFixed(2),
    city: zone.city,
    cityName: zone.cityName,
    cityNameEn: zone.cityNameEn,
    estimatedTime,
    estimatedTimeText: `${estimatedTime}分钟`,
    active: zone.active,
    zoneRadius: zone.radius,
    message
  };
}

/**
 * 自动检测最近的城市配送区域
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @returns {Object} 最近的城市配送信息
 */
function findNearestZone(lat, lng) {
  const distances = DELIVERY_ZONES
    .filter(z => z.active)
    .map(zone => {
      const distance = haversineDistance(lat, lng, zone.center[0], zone.center[1]);
      return {
        ...zone,
        distance,
        distanceKm: (distance / 1000).toFixed(2),
        inRange: distance <= zone.radiusMeters
      };
    });

  // 按距离排序
  distances.sort((a, b) => a.distance - b.distance);

  const nearest = distances[0];
  if (!nearest) {
    return { found: false, message: '暂无可配送城市' };
  }

  return {
    found: true,
    nearestCity: nearest.city,
    cityName: nearest.cityName,
    cityNameEn: nearest.cityNameEn,
    distance: nearest.distance,
    distanceKm: nearest.distanceKm,
    inRange: nearest.inRange,
    zoneRadius: nearest.radius,
    estimatedTime: nearest.baseTime + Math.round((nearest.distance / 1000) / nearest.avgSpeedKmh * 60),
    allZones: distances.map(d => ({
      city: d.city,
      cityName: d.cityName,
      distanceKm: d.distanceKm,
      inRange: d.inRange
    }))
  };
}

// ============================================================
// 配送费用计算
// ============================================================

/**
 * 根据距离和订单金额计算配送费
 * @param {number} distanceMeters - 距离（米）
 * @param {number} subtotal - 订单小计金额（USD）
 * @returns {{
 *   fee: number,
 *   feeFormatted: string,
 *   freeShipping: boolean,
 *   freeShippingThreshold: number,
 *   distanceTier: string,
 *   originalFee: number,
 *   savings: number
 * }}
 */
function calculateDeliveryFee(distanceMeters, subtotal) {
  if (typeof distanceMeters !== 'number' || distanceMeters < 0) {
    throw new Error('[DeliveryValidator] 距离必须为非负数');
  }
  if (typeof subtotal !== 'number' || subtotal < 0) {
    throw new Error('[DeliveryValidator] 订单金额必须为非负数');
  }

  const config = DELIVERY_FEE_CONFIG;

  // 查找距离对应的费用档位
  let fee = config.tiers[config.tiers.length - 1].fee;
  let distanceTier = '>15km';

  for (const tier of config.tiers) {
    if (distanceMeters <= tier.maxDistance) {
      fee = tier.fee;
      distanceTier = tier.maxDistance === Infinity
        ? '>15km'
        : `≤${(tier.maxDistance / 1000).toFixed(0)}km`;
      break;
    }
  }

  const originalFee = fee;

  // 满$30免运费
  const freeShipping = subtotal >= config.freeShippingThreshold;
  if (freeShipping) {
    fee = 0;
  }

  const savings = originalFee - fee;

  return {
    fee,
    feeFormatted: fee === 0 ? '免运费' : `${config.currencySymbol}${fee.toFixed(2)}`,
    freeShipping,
    freeShippingThreshold: config.freeShippingThreshold,
    freeShippingThresholdFormatted: `${config.currencySymbol}${config.freeShippingThreshold.toFixed(2)}`,
    distanceTier,
    originalFee,
    savings,
    savingsFormatted: savings > 0 ? `${config.currencySymbol}${savings.toFixed(2)}` : '-',
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    remainingForFreeShipping: Math.max(0, config.freeShippingThreshold - subtotal),
    remainingForFreeShippingFormatted: `${config.currencySymbol}${Math.max(0, config.freeShippingThreshold - subtotal).toFixed(2)}`
  };
}

/**
 * 计算完整配送信息（范围+费用）
 * @param {number} lat - 客户纬度
 * @param {number} lng - 客户经度
 * @param {string} city - 城市代码
 * @param {number} subtotal - 订单金额
 * @returns {Object} 完整配送信息
 */
function getDeliveryInfo(lat, lng, city, subtotal) {
  const zoneValidation = validateDeliveryZone(lat, lng, city);
  const feeInfo = calculateDeliveryFee(zoneValidation.distance, subtotal);

  return {
    deliverable: zoneValidation.inRange,
    zone: {
      city: zoneValidation.city,
      cityName: zoneValidation.cityName,
      inRange: zoneValidation.inRange,
      distance: zoneValidation.distance,
      distanceKm: zoneValidation.distanceKm,
      estimatedTime: zoneValidation.estimatedTime,
      estimatedTimeText: zoneValidation.estimatedTimeText,
      active: zoneValidation.active
    },
    fee: feeInfo,
    message: zoneValidation.message
  };
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取所有配送区域信息
 * @returns {Array<Object>}
 */
function getAllZones() {
  return DELIVERY_ZONES.map(z => ({
    city: z.city,
    cityName: z.cityName,
    cityNameEn: z.cityNameEn,
    center: z.center,
    radius: z.radius,
    active: z.active,
    status: z.active ? '已开通' : '即将开通'
  }));
}

/**
 * 获取已开通配送的城市列表
 * @returns {Array<Object>}
 */
function getActiveZones() {
  return getAllZones().filter(z => z.active);
}

/**
 * 格式化距离显示
 * @param {number} meters - 距离（米）
 * @returns {string}
 */
function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * 格式化配送时间
 * @param {number} minutes - 分钟数
 * @returns {string}
 */
function formatTime(minutes) {
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
}

// ============================================================
// Express.js 路由中间件（可选）
// ============================================================

/**
 * 创建Express路由
 * @returns {Object} Express Router
 */
function createRoutes() {
  const express = require('express');
  const router = express.Router();

  // GET /api/delivery/zones - 获取所有配送区域
  router.get('/zones', (req, res) => {
    res.json({
      success: true,
      data: getAllZones()
    });
  });

  // GET /api/delivery/validate - 验证配送地址
  router.get('/validate', (req, res) => {
    try {
      const { lat, lng, city } = req.query;

      if (!lat || !lng || !city) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数: lat, lng, city'
        });
      }

      const result = validateDeliveryZone(parseFloat(lat), parseFloat(lng), city);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/delivery/fee - 计算配送费
  router.post('/fee', (req, res) => {
    try {
      const { distance, subtotal } = req.body;

      if (distance === undefined || subtotal === undefined) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数: distance（米）, subtotal（金额）'
        });
      }

      const result = calculateDeliveryFee(parseFloat(distance), parseFloat(subtotal));
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/delivery/info - 完整配送信息
  router.post('/info', (req, res) => {
    try {
      const { lat, lng, city, subtotal } = req.body;

      if (!lat || !lng || !city || subtotal === undefined) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数: lat, lng, city, subtotal'
        });
      }

      const result = getDeliveryInfo(
        parseFloat(lat),
        parseFloat(lng),
        city,
        parseFloat(subtotal)
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/delivery/nearest - 查找最近配送点
  router.get('/nearest', (req, res) => {
    try {
      const { lat, lng } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数: lat, lng'
        });
      }

      const result = findNearestZone(parseFloat(lat), parseFloat(lng));
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}

// ============================================================
// 模块导出
// ============================================================

module.exports = {
  // 核心函数
  validateDeliveryZone,
  calculateDeliveryFee,
  getDeliveryInfo,
  findNearestZone,

  // 距离计算
  haversineDistance,
  batchCalculateDistances,

  // 数据查询
  getAllZones,
  getActiveZones,

  // 工具函数
  formatDistance,
  formatTime,

  // Express路由
  createRoutes,

  // 配置数据
  DELIVERY_ZONES,
  DELIVERY_FEE_CONFIG
};
