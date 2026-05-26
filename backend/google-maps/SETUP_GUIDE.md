# Google Maps API Key 申请与集成指南

> **适用项目**：白马有机果蔬农场（柬埔寨）
> **版本**：v1.0
> **更新日期**：2025年1月

---

## 目录

1. [创建 Google Cloud 项目](#第一步创建-google-cloud-项目)
2. [启用 Maps API](#第二步启用-maps-api)
3. [创建 API Key](#第三步创建-api-key)
4. [安全限制设置](#第四步限制api-key重要安全设置)
5. [计费与预算设置](#第五步计费设置)
6. [前端代码集成](#第六步前端集成)
7. [柬埔寨注意事项](#柬埔寨注意事项)
8. [常见问题排查](#常见问题排查)
9. [备用方案](#备用方案-openstreetmap)

---

## 第一步：创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 登录 Google 账号（**建议使用公司账号**，避免个人账号权限问题）
3. 点击顶部项目选择器 → **"新建项目"**
4. 填写项目信息：
   - **项目名称**：`whitehorse-farm`
   - **组织**：选择您的公司组织（可选）
   - **位置**：默认即可
5. 点击 **"创建"**，等待项目创建完成
6. 确认项目已切换至 `whitehorse-farm`

![创建项目示意图](https://developers.google.com/maps/documentation/javascript/cloud-setup-cpp)

---

## 第二步：启用 Maps API

1. 在左侧导航栏，进入 **"API 和服务" → "库"**
2. 依次搜索并启用以下 5 个 API：

| API 名称 | 用途 | 每月免费额度 |
|---------|------|------------|
| **Maps JavaScript API** | 网页地图显示 | 28,000 次加载 |
| **Geocoding API** | 地址↔坐标转换 | 40,000 次请求 |
| **Directions API** | 路线规划 | 40,000 次请求 |
| **Places API** | 地址自动补全 | 5,000 次请求 |
| **Distance Matrix API** | 批量距离计算 | 40,000 次元素 |

3. 每个 API 点击后进入详情页，点击 **"启用"** 按钮

> **注意**：启用 API 可能需要几分钟生效，请耐心等待。

---

## 第三步：创建 API Key

1. 进入 **"API 和服务" → "凭据"**
2. 点击 **"创建凭据" → "API 密钥"**
3. 弹出窗口显示新生成的 API Key（类似：`AIzaSyCxxxxxxxxxxxxxxxxxxxxxxxx`）
4. **立即复制保存到安全位置**，此 Key 只会完整显示一次

![创建API Key](https://developers.google.com/maps/documentation/javascript/get-api-key)

---

## 第四步：限制 API Key（⚠️ 重要安全设置）

**未限制的 API Key 可能被滥用，产生高额费用！** 务必完成以下设置：

### 4.1 应用限制（HTTP 引荐来源网址）

1. 在凭据页面，点击刚创建的 API Key 名称
2. 找到 **"应用限制"** 部分
3. 选择 **"HTTP 引荐来源网址（网站）"**
4. 点击 **"添加项目"**，依次添加以下网址：

```
https://whitehorse-farm.com/*
https://*.whitehorse-farm.com/*
https://offtuseuiinme.kimi.page/*      ← 演示/测试环境
http://localhost:*/*                    ← 本地开发（可选）
```

5. 如果有更多子域名，使用通配符 `*.` 前缀

### 4.2 API 限制

1. 找到 **"API 限制"** 部分
2. 选择 **"限制密钥"**
3. 勾选以下 5 个 API：
   - ✅ Maps JavaScript API
   - ✅ Geocoding API
   - ✅ Directions API
   - ✅ Places API
   - ✅ Distance Matrix API

4. 点击 **"保存"**

> **安全提示**：
> - 绝不要在 GitHub 等公开仓库提交 API Key
> - 生产环境应使用后端代理转发请求
> - 定期轮换 API Key（建议每 3-6 个月）

---

## 第五步：计费设置

### 5.1 关联结算账号

1. 进入 **"计费" → "关联结算账号"**
2. 如果没有结算账号，点击 **"创建结算账号"**
3. 填写付款信息（信用卡/借记卡）
4. 选择或创建结算账号后，关联到项目

### 5.2 免费额度说明

Google Maps Platform 每月提供 **$200 免费额度**，对于白马农场项目完全足够：

| API | 每月免费额度 | 预估用量 | 费用 |
|-----|-----------|---------|------|
| Maps JavaScript API | 28,000 次 | ~5,000 次 | $0 |
| Geocoding API | 40,000 次 | ~3,000 次 | $0 |
| Directions API | 40,000 次 | ~2,000 次 | $0 |
| Places API | 5,000 次 | ~1,000 次 | $0 |
| Distance Matrix API | 40,000 元素 | ~1,000 次 | $0 |

> **结论**：月访问量 < 5 万的情况下，费用为 **$0**

### 5.3 设置预算警报

1. 进入 **"计费" → "预算和提醒"**
2. 点击 **"创建预算"**
3. 设置预算金额（建议 **$50** 作为警戒线）
4. 添加提醒阈值：
   - 50% 提醒（$25）
   - 90% 提醒（$45）
   - 100% 提醒（$50）
5. 设置通知邮箱（建议：admin@whitehorse-farm.com）

---

## 第六步：前端集成

### 6.1 将 API Key 填入项目

```javascript
// config.js - 配置文件
const FARM_MAPS_API_KEY = 'AIzaSyCxxxxxxxxxxxxxxxxxxxxxxxx';  // ← 替换为您的API Key
const maps = new FarmMaps(FARM_MAPS_API_KEY, 'map-container');

// 初始化流程
maps.loadScript()
  .then(() => maps.initMap())
  .then(() => {
    // 显示商店标记
    maps.addStoreMarker('phnompenh');
    // 显示配送范围
    maps.showDeliveryRange({ lat: 11.5564, lng: 104.9282 }, 15000);
  })
  .catch(err => console.error('地图初始化失败:', err));
```

### 6.2 完整使用示例

```javascript
// 示例：地址验证 + 配送范围检查 + 费用计算
async function checkDelivery(address, orderSubtotal) {
  const maps = new FarmMaps(FARM_MAPS_API_KEY, 'map-container');
  await maps.loadScript();
  maps.initMap();

  // 1. 解析用户地址
  const location = await maps.geocodeAddress(address);
  console.log('解析坐标:', location.lat, location.lng);

  // 2. 检查是否在配送范围内
  const storeLat = 11.5564, storeLng = 104.9282;
  const rangeCheck = maps.isInDeliveryRange(
    location.lat, location.lng,
    storeLat, storeLng,
    15000  // 15km
  );

  if (!rangeCheck.inRange) {
    return { deliverable: false, message: `超出配送范围（${rangeCheck.distanceKm}km）` };
  }

  // 3. 规划配送路线
  const route = await maps.calculateRoute(
    { lat: storeLat, lng: storeLng },
    { lat: location.lat, lng: location.lng }
  );

  // 4. 计算配送费
  const { calculateDeliveryFee } = require('./delivery-validator');
  const fee = calculateDeliveryFee(rangeCheck.distance, orderSubtotal);

  return {
    deliverable: true,
    distance: rangeCheck.distanceKm + 'km',
    estimatedTime: rangeCheck.estimatedTime + '分钟',
    deliveryFee: fee.feeFormatted,
    freeShipping: fee.freeShipping,
    route: route
  };
}

// 使用
checkDelivery('Phnom Penh, Toul Kork', 25.00)
  .then(result => console.log(result));
```

### 6.3 环境变量配置（推荐）

```bash
# .env 文件（不要提交到版本控制）
GOOGLE_MAPS_API_KEY=AIzaSyCxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_MAPS_REGION=KH
GOOGLE_MAPS_LANGUAGE=zh-CN

# 配送设置
DELIVERY_RADIUS_METERS=15000
FREE_SHIPPING_THRESHOLD=30
```

```javascript
// 使用环境变量
const FARM_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!FARM_MAPS_API_KEY) {
  throw new Error('GOOGLE_MAPS_API_KEY 环境变量未设置');
}
```

---

## 柬埔寨注意事项

### ✅ Google Maps 在柬埔寨的表现

| 城市 | 地图覆盖 | 街道精度 | Geocoding 支持 | 推荐度 |
|-----|---------|---------|---------------|--------|
| **金边 (Phnom Penh)** | 优秀 | 高 | 良好 | ⭐⭐⭐⭐⭐ |
| **西哈努克 (Sihanoukville)** | 良好 | 中高 | 良好 | ⭐⭐⭐⭐ |
| **暹粒 (Siem Reap)** | 良好 | 中高 | 中等 | ⭐⭐⭐⭐ |
| **马德望 (Battambang)** | 中等 | 中等 | 一般 | ⭐⭐⭐ |

### 📝 地址输入建议

1. **建议使用英文地址**，Geocoding 识别率更高：
   ```
   ✅ 推荐: "No. 123, Street 456, Toul Kork, Phnom Penh, Cambodia"
   ⚠️  慎用: "柬埔寨金边堆谷区123号路456号"
   ```

2. **高棉语地址也可使用**，但可能返回英文结果

3. **常见地址格式**：
   ```
   [门牌号], [街道名称], [区/Sangkat], [市/Khan], Phnom Penh, Cambodia
   ```

### 🏍️ 配送相关

- 柬埔寨主要使用 **摩托车** 配送，城市交通灵活
- 建议路线规划使用 `TWO_WHEELER` 模式
- 高峰期（11:30-13:00, 17:30-19:00）适当延长预计时间
- 雨季（5-10月）道路可能影响配送速度

---

## 常见问题排查

### Q1: 地图显示空白 / "API Key 无效"

```
原因1: API Key 未正确复制
解决: 重新到 Cloud Console 复制完整 Key

原因2: Maps JavaScript API 未启用
解决: 检查 "API 和服务 → 库" 中是否已启用

原因3: HTTP 引荐来源限制错误
解决: 检查网址是否包含当前域名（注意 http/https 区别）

原因4: 结算账号未关联
解决: 检查 "计费" 页面是否已关联有效结算账号
```

### Q2: Geocoding 返回 "ZERO_RESULTS"

```
原因: 地址格式不正确或不完整
解决: 尝试使用更详细的英文地址，添加 ", Cambodia" 后缀

示例修正:
- ❌ "堆谷区 123号"
- ✅ "No. 123, Toul Kork, Phnom Penh, Cambodia"
```

### Q3: 超出每日配额限制

```
原因: 免费额度已用完或配额设置过低
解决:
1. 到 "API 和服务 → 配额" 检查限制
2. 申请提高配额（如有需要）
3. 考虑启用缓存减少重复请求
```

### Q4: Places 自动补全不工作

```
原因1: Places API 未启用
解决: 在 API 库中启用 Places API (New)

原因2: 输入框未正确绑定
解决: 确保输入框在 DOM 中可见且有正确的 id
```

### Q5: 路线规划返回 "ZERO_RESULTS"

```
原因: 起点/终点位置在柬埔寨可能没有完整的路网数据
解决: 尝试选择更靠近主干道的坐标点
```

---

## 备用方案：OpenStreetMap

如果 Google Maps 成本过高或某些区域覆盖不足，可使用 **OpenStreetMap + Leaflet** 作为免费替代：

```javascript
// 使用 Leaflet + OpenStreetMap（完全免费）
// 需安装: npm install leaflet

import L from 'leaflet';

function initOSMMap(containerId) {
  const map = L.map(containerId).setView([11.5564, 104.9282], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  return map;
}

// 注意：OSM 的 Geocoding 精度在柬埔寨可能低于 Google Maps
// 建议使用 Nominatim API: https://nominatim.openstreetmap.org/
```

| 特性 | Google Maps | OpenStreetMap |
|-----|-------------|---------------|
| 费用 | $200/月免费额度后收费 | 完全免费 |
| 柬埔寨精度 | 高 | 中等 |
| Geocoding | 优秀 | 一般 |
| 路线规划 | 优秀 | 需额外服务 |
| 地址补全 | 内置 | 需自行实现 |
| 使用量限制 | 有 | 几乎无限制 |

---

## 联系与支持

| 问题类型 | 联系方式 |
|---------|---------|
| Google Maps 技术问题 | [Google Maps Platform 支持](https://developers.google.com/maps/support) |
| 结算与费用问题 | Cloud Console → 计费 → 支持 |
| 项目集成问题 | 联系白马农场技术团队 |
| API Key 泄露/紧急轮换 | 立即到 Cloud Console 删除并重新创建 |

---

## 检查清单

在开始集成前，请确认以下事项：

- [ ] Google Cloud 项目已创建 (`whitehorse-farm`)
- [ ] 5 个 Maps API 已启用
- [ ] API Key 已创建并复制
- [ ] HTTP 引荐来源网址已限制
- [ ] API 使用范围已限制
- [ ] 结算账号已关联
- [ ] 预算警报已设置
- [ ] API Key 已填入项目配置（环境变量）
- [ ] 本地开发测试通过
- [ ] 生产环境域名已添加到引荐来源

---

> **本文档由白马农场技术团队维护**
> 最后更新：2025年1月
