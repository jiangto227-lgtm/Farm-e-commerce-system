/**
 * 白马有机果蔬农场 - Google Maps集成模块
 * 功能：定位、地址解析、配送范围计算、地图显示
 * 版本：1.0.0
 * 支持：柬埔寨金边/西哈努克/暹粒/马德望
 */

const MapsConfig = {
  // 柬埔寨默认中心坐标（金边）
  center: { lat: 11.5564, lng: 104.9282 },
  // 4个配送城市坐标
  cities: {
    phnompenh: { lat: 11.5564, lng: 104.9282, name: '金边', nameEn: 'Phnom Penh' },
    sihanoukville: { lat: 10.6257, lng: 103.5235, name: '西哈努克', nameEn: 'Sihanoukville' },
    siemreap: { lat: 13.3633, lng: 103.8560, name: '暹粒', nameEn: 'Siem Reap' },
    battambang: { lat: 13.0957, lng: 103.2022, name: '马德望', nameEn: 'Battambang' }
  },
  // 15km配送半径（金边），其他城市见DELIVERY_ZONES
  deliveryRadius: 15000, // meters
  zoom: 13,
  // 地图样式（简洁风格）
  mapStyles: [
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] }
  ]
};

/**
 * 白马农场地图类
 * 封装Google Maps所有交互功能
 */
class FarmMaps {
  constructor(apiKey, containerId, options = {}) {
    this.apiKey = apiKey;
    this.containerId = containerId;
    this.map = null;
    this.markers = [];
    this.deliveryCircle = null;
    this.geocoder = null;
    this.directionsService = null;
    this.directionsRenderer = null;
    this.placesService = null;
    this.autocomplete = null;
    this.options = { ...MapsConfig, ...options };
    this.scriptLoaded = false;
    this.wsConnection = null;
  }

  /**
   * 加载Google Maps脚本（动态加载）
   * @returns {Promise<void>}
   */
  async loadScript() {
    return new Promise((resolve, reject) => {
      // 检查是否已加载
      if (window.google && window.google.maps) {
        this.scriptLoaded = true;
        resolve();
        return;
      }

      // 检查是否已在加载中
      const existingScript = document.getElementById('google-maps-script');
      if (existingScript) {
        existingScript.addEventListener('load', () => {
          this.scriptLoaded = true;
          resolve();
        });
        existingScript.addEventListener('error', reject);
        return;
      }

      // 创建脚本元素
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=places,geometry,geocoding,directions&callback=initMap&region=KH&language=zh-CN`;
      script.async = true;
      script.defer = true;

      // 全局回调
      window.initMap = () => {
        this.scriptLoaded = true;
        resolve();
      };

      script.onerror = (err) => {
        console.error('[FarmMaps] Google Maps脚本加载失败:', err);
        reject(new Error('Google Maps脚本加载失败，请检查API Key'));
      };

      script.onabort = () => {
        reject(new Error('Google Maps脚本加载被中断'));
      };

      // 超时处理（10秒）
      const timeout = setTimeout(() => {
        reject(new Error('Google Maps脚本加载超时（10s），请检查网络连接'));
      }, 10000);

      const cleanup = () => clearTimeout(timeout);
      script.addEventListener('load', cleanup);
      script.addEventListener('error', cleanup);

      document.head.appendChild(script);
    });
  }

  /**
   * 初始化地图
   * @param {Object} center - 中心坐标 { lat, lng }
   * @param {number} zoom - 缩放级别
   * @returns {google.maps.Map}
   */
  initMap(center, zoom) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      throw new Error(`[FarmMaps] 找不到地图容器: #${this.containerId}`);
    }

    const mapOptions = {
      center: center || this.options.center,
      zoom: zoom || this.options.zoom,
      styles: this.options.mapStyles,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: 'cooperative',
      region: 'KH'
    };

    this.map = new google.maps.Map(container, mapOptions);
    this.geocoder = new google.maps.Geocoder();
    this.directionsService = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#4CAF50',
        strokeWeight: 4,
        strokeOpacity: 0.8
      }
    });
    this.directionsRenderer.setMap(this.map);

    // 初始化Places服务
    this.placesService = new google.maps.places.PlacesService(this.map);

    console.log('[FarmMaps] 地图初始化完成');
    return this.map;
  }

  /**
   * 获取当前定位（Geolocation API）
   * @param {boolean} highAccuracy - 是否高精度
   * @returns {Promise<{lat:number, lng:number, accuracy:number}>}
   */
  async getCurrentPosition(highAccuracy = true) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        console.warn('[FarmMaps] 浏览器不支持Geolocation，使用默认坐标（金边）');
        resolve({ ...this.options.center, accuracy: Infinity });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const result = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy, // 精度（米）
            timestamp: position.timestamp
          };
          console.log('[FarmMaps] 定位成功:', result);
          resolve(result);
        },
        (error) => {
          console.warn('[FarmMaps] 定位失败，降级到默认坐标:', error.message);
          // 错误降级：使用IP定位或默认金边
          let fallback = { ...this.options.center, accuracy: Infinity };
          switch (error.code) {
            case error.PERMISSION_DENIED:
              console.warn('用户拒绝了定位权限');
              break;
            case error.POSITION_UNAVAILABLE:
              console.warn('位置信息不可用');
              break;
            case error.TIMEOUT:
              console.warn('定位超时');
              break;
          }
          resolve(fallback); // 降级而非拒绝
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 10000 : 5000,
          maximumAge: 60000 // 允许1分钟缓存
        }
      );
    });
  }

  /**
   * 持续追踪位置（用于骑手端）
   * @param {Function} positionCallback - 位置更新回调
   * @returns {number} watchId
   */
  watchPosition(positionCallback) {
    if (!navigator.geolocation) {
      console.error('[FarmMaps] 浏览器不支持位置追踪');
      return null;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const result = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp
        };
        positionCallback(result);
      },
      (error) => {
        console.error('[FarmMaps] 位置追踪错误:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0 // 实时更新，不使用缓存
      }
    );

    return watchId;
  }

  /**
   * 停止位置追踪
   * @param {number} watchId
   */
  clearWatch(watchId) {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  /**
   * 地址解析（地址 → 坐标）
   * @param {string} address - 地址字符串
   * @param {string} region - 地区偏置（默认柬埔寨）
   * @returns {Promise<{lat:number, lng:number, formatted_address:string, place_id:string}>}
   */
  async geocodeAddress(address, region = 'kh') {
    return new Promise((resolve, reject) => {
      if (!this.geocoder) {
        reject(new Error('[FarmMaps] 地理编码器未初始化，请先调用initMap()'));
        return;
      }

      if (!address || address.trim().length === 0) {
        reject(new Error('[FarmMaps] 地址不能为空'));
        return;
      }

      // 自动补全国家信息
      let searchAddress = address;
      if (!address.toLowerCase().includes('cambodia') && !address.includes('柬埔寨')) {
        searchAddress = `${address}, Cambodia`;
      }

      this.geocoder.geocode(
        { address: searchAddress, region: region },
        (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            const location = results[0].geometry.location;
            const result = {
              lat: location.lat(),
              lng: location.lng(),
              formatted_address: results[0].formatted_address,
              place_id: results[0].place_id,
              address_components: results[0].address_components,
              partial_match: results[0].partial_match || false,
              types: results[0].types
            };
            console.log('[FarmMaps] 地址解析成功:', result.formatted_address);
            resolve(result);
          } else {
            const errorMap = {
              'ZERO_RESULTS': '未找到该地址，请检查输入',
              'OVER_QUERY_LIMIT': '请求配额超限，请稍后重试',
              'REQUEST_DENIED': '请求被拒绝，请检查API Key权限',
              'INVALID_REQUEST': '无效请求，地址参数缺失',
              'UNKNOWN_ERROR': '未知错误，请稍后重试'
            };
            const errorMsg = errorMap[status] || `地址解析失败: ${status}`;
            console.error('[FarmMaps]', errorMsg);
            reject(new Error(errorMsg));
          }
        }
      );
    });
  }

  /**
   * 反向地址解析（坐标 → 地址）
   * @param {number} lat - 纬度
   * @param {number} lng - 经度
   * @param {string} language - 语言（默认中文）
   * @returns {Promise<string>}
   */
  async reverseGeocode(lat, lng, language = 'zh-CN') {
    return new Promise((resolve, reject) => {
      if (!this.geocoder) {
        reject(new Error('[FarmMaps] 地理编码器未初始化'));
        return;
      }

      this.geocoder.geocode(
        { location: { lat, lng }, language },
        (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            // 优先返回街道地址，其次是区域地址
            const streetAddress = results.find(r =>
              r.types.includes('street_address') || r.types.includes('premise')
            );
            const political = results.find(r =>
              r.types.includes('political') || r.types.includes('locality')
            );

            const bestResult = streetAddress || political || results[0];
            console.log('[FarmMaps] 反向解析成功:', bestResult.formatted_address);
            resolve(bestResult.formatted_address);
          } else {
            reject(new Error(`反向地址解析失败: ${status}`));
          }
        }
      );
    });
  }

  /**
   * 显示配送范围（圆形覆盖物）
   * @param {Object} center - 中心坐标 { lat, lng }
   * @param {number} radius - 半径（米，默认15000）
   * @param {Object} style - 自定义样式
   */
  showDeliveryRange(center, radius, style = {}) {
    const defaultStyle = {
      strokeColor: '#4CAF50',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#4CAF50',
      fillOpacity: 0.15,
      ...style
    };

    // 移除旧的配送范围
    if (this.deliveryCircle) {
      this.deliveryCircle.setMap(null);
    }

    this.deliveryCircle = new google.maps.Circle({
      map: this.map,
      center: center || this.options.center,
      radius: radius || this.options.deliveryRadius,
      ...defaultStyle,
      clickable: false
    });

    // 自适应视图
    this.map.fitBounds(this.deliveryCircle.getBounds());

    console.log('[FarmMaps] 配送范围已显示，半径:', (radius || this.options.deliveryRadius) / 1000, 'km');
  }

  /**
   * 添加标记
   * @param {Object} position - { lat, lng }
   * @param {string} title - 标记标题
   * @param {string} icon - 自定义图标URL或SVG
   * @param {Object} infoContent - 信息窗口内容
   * @returns {google.maps.Marker}
   */
  addMarker(position, title, icon = null, infoContent = null) {
    const markerOptions = {
      position,
      map: this.map,
      title,
      animation: google.maps.Animation.DROP
    };

    if (icon) {
      markerOptions.icon = icon;
    }

    const marker = new google.maps.Marker(markerOptions);
    this.markers.push(marker);

    // 添加信息窗口
    if (infoContent) {
      const infoWindow = new google.maps.InfoWindow({
        content: infoContent,
        maxWidth: 300
      });

      marker.addListener('click', () => {
        // 关闭其他信息窗口（可选）
        infoWindow.open(this.map, marker);
      });
    }

    return marker;
  }

  /**
   * 添加商店/农场标记
   * @param {string} city - 城市key
   * @returns {google.maps.Marker}
   */
  addStoreMarker(city = 'phnompenh') {
    const cityData = this.options.cities[city];
    if (!cityData) {
      console.error('[FarmMaps] 未知城市:', city);
      return null;
    }

    // 农场SVG图标
    const farmIcon = {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="#4CAF50" stroke="#fff" stroke-width="2"/>
          <text x="20" y="25" text-anchor="middle" fill="#fff" font-size="16">🥬</text>
        </svg>
      `),
      scaledSize: new google.maps.Size(40, 40),
      anchor: new google.maps.Point(20, 20)
    };

    const content = `
      <div style="padding:10px;min-width:200px;">
        <h3 style="margin:0 0 8px;color:#4CAF50;">🥬 白马有机果蔬农场</h3>
        <p style="margin:4px 0;font-size:13px;"><strong>城市:</strong> ${cityData.name} (${cityData.nameEn})</p>
        <p style="margin:4px 0;font-size:13px;"><strong>配送:</strong> 新鲜直达，最快30分钟</p>
        <p style="margin:4px 0;font-size:13px;"><strong>范围:</strong> 周边15公里</p>
      </div>
    `;

    return this.addMarker(
      { lat: cityData.lat, lng: cityData.lng },
      `白马有机果蔬农场 - ${cityData.name}`,
      farmIcon,
      content
    );
  }

  /**
   * 添加客户位置标记
   * @param {Object} position - { lat, lng }
   * @param {string} address - 地址
   * @returns {google.maps.Marker}
   */
  addCustomerMarker(position, address = '') {
    const customerIcon = {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="#2196F3" stroke="#fff" stroke-width="2"/>
          <text x="18" y="23" text-anchor="middle" fill="#fff" font-size="14">📍</text>
        </svg>
      `),
      scaledSize: new google.maps.Size(36, 36),
      anchor: new google.maps.Point(18, 18)
    };

    const content = `
      <div style="padding:8px;">
        <h4 style="margin:0 0 6px;">📍 您的位置</h4>
        <p style="margin:0;font-size:12px;color:#666;">${address || '未知地址'}</p>
      </div>
    `;

    return this.addMarker(position, '您的位置', customerIcon, content);
  }

  /**
   * 计算两点间距离（Haversine公式）
   * 不依赖Google API，纯前端计算
   * @param {Object} from - { lat, lng }
   * @param {Object} to - { lat, lng }
   * @returns {number} 距离（米）
   */
  calculateDistance(from, to) {
    const R = 6371000; // 地球半径（米）
    const dLat = this._toRadians(to.lat - from.lat);
    const dLng = this._toRadians(to.lng - from.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRadians(from.lat)) *
        Math.cos(this._toRadians(to.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance);
  }

  /**
   * 角度转弧度
   * @private
   */
  _toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * 判断是否在配送范围内
   * @param {number} customerLat - 客户纬度
   * @param {number} customerLng - 客户经度
   * @param {number} storeLat - 商店纬度
   * @param {number} storeLng - 商店经度
   * @param {number} radius - 半径（米，默认15000）
   * @returns {{inRange:boolean, distance:number, distanceKm:string}}
   */
  isInDeliveryRange(customerLat, customerLng, storeLat, storeLng, radius = 15000) {
    const distance = this.calculateDistance(
      { lat: storeLat, lng: storeLng },
      { lat: customerLat, lng: customerLng }
    );

    const inRange = distance <= radius;
    const distanceKm = (distance / 1000).toFixed(1);

    console.log(`[FarmMaps] 距离: ${distanceKm}km, 范围内: ${inRange}`);

    return {
      inRange,
      distance,
      distanceKm,
      radius,
      estimatedTime: this._estimateDeliveryTime(distance)
    };
  }

  /**
   * 估算配送时间
   * @private
   * @param {number} distanceMeters - 距离（米）
   * @returns {number} 预计分钟数
   */
  _estimateDeliveryTime(distanceMeters) {
    // 柬埔寨城市交通状况：平均速度约25-30km/h
    const avgSpeedMps = 7; // ~25km/h
    const baseTime = 10; // 基础准备时间10分钟
    const travelTime = distanceMeters / avgSpeedMps / 60; // 分钟
    return Math.round(baseTime + travelTime);
  }

  /**
   * 配送路线规划
   * @param {Object} origin - 起点 { lat, lng }
   * @param {Object} destination - 终点 { lat, lng }
   * @param {Array<{lat:number,lng:number}>} waypoints - 途经点
   * @param {string} travelMode - 出行方式（DRIVING/BICYCLING/TWO_WHEELER）
   * @returns {Promise<{distance:string, duration:string, route:Object, steps:Array}>}
   */
  async calculateRoute(origin, destination, waypoints = [], travelMode = 'DRIVING') {
    return new Promise((resolve, reject) => {
      if (!this.directionsService) {
        reject(new Error('[FarmMaps] 路线服务未初始化'));
        return;
      }

      // 在柬埔寨， TWO_WHEELER 更适合摩托车配送
      const mode = travelMode === 'MOTORCYCLE' ? 'TWO_WHEELER' : travelMode;

      const request = {
        origin,
        destination,
        travelMode: google.maps.TravelMode[mode] || google.maps.TravelMode.DRIVING,
        optimizeWaypoints: waypoints.length > 0,
        region: 'KH'
      };

      if (waypoints.length > 0) {
        request.waypoints = waypoints.map(wp => ({
          location: wp,
          stopover: true
        }));
      }

      this.directionsService.route(request, (result, status) => {
        if (status === 'OK') {
          this.directionsRenderer.setDirections(result);

          const route = result.routes[0];
          const leg = route.legs[0];

          const routeData = {
            distance: leg.distance.text,
            distanceValue: leg.distance.value, // 米
            duration: leg.duration.text,
            durationValue: leg.duration.value, // 秒
            route: result,
            steps: leg.steps.map(step => ({
              instruction: step.instructions,
              distance: step.distance.text,
              duration: step.duration.text,
              maneuver: step.maneuver || null
            })),
            polyline: route.overview_polyline
          };

          console.log('[FarmMaps] 路线规划完成:', routeData.distance, routeData.duration);
          resolve(routeData);
        } else {
          const errorMap = {
            'NOT_FOUND': '起点或终点无法定位',
            'ZERO_RESULTS': '找不到可用路线',
            'MAX_WAYPOINTS_EXCEEDED': '途经点过多（最多25个）',
            'INVALID_REQUEST': '请求参数无效',
            'OVER_QUERY_LIMIT': '请求配额超限',
            'REQUEST_DENIED': '请求被拒绝',
            'UNKNOWN_ERROR': '未知错误'
          };
          reject(new Error(errorMap[status] || `路线规划失败: ${status}`));
        }
      });
    });
  }

  /**
   * 地址自动补全（Places API）
   * @param {string} inputId - 输入框ID
   * @param {string} city - 城市偏置
   * @param {Function} onPlaceSelect - 选中回调
   */
  initAutocomplete(inputId, city = 'phnompenh', onPlaceSelect = null) {
    const input = document.getElementById(inputId);
    if (!input) {
      console.error('[FarmMaps] 找不到输入框:', inputId);
      return;
    }

    const cityData = this.options.cities[city];
    const bounds = cityData ? new google.maps.LatLngBounds(
      new google.maps.LatLng(cityData.lat - 0.5, cityData.lng - 0.5),
      new google.maps.LatLng(cityData.lat + 0.5, cityData.lng + 0.5)
    ) : null;

    this.autocomplete = new google.maps.places.Autocomplete(input, {
      types: ['address'],
      componentRestrictions: { country: 'KH' },
      bounds: bounds,
      strictBounds: false
    });

    this.autocomplete.addListener('place_changed', () => {
      const place = this.autocomplete.getPlace();
      if (!place.geometry) {
        console.warn('[FarmMaps] 未选择有效地点');
        return;
      }

      const result = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        formatted_address: place.formatted_address,
        name: place.name,
        place_id: place.place_id
      };

      if (onPlaceSelect) {
        onPlaceSelect(result);
      }

      console.log('[FarmMaps] 地址选择:', result.formatted_address);
    });

    console.log('[FarmMaps] 自动补全已初始化');
  }

  /**
   * 骑手实时位置追踪（WebSocket）
   * @param {string} riderId - 骑手ID
   * @param {Function} positionCallback - 位置更新回调
   * @param {string} wsUrl - WebSocket服务器地址
   */
  trackRider(riderId, positionCallback, wsUrl = null) {
    // 关闭已有连接
    if (this.wsConnection) {
      this.wsConnection.close();
    }

    const wsEndpoint = wsUrl || `wss://api.whitehorse-farm.com/ws/rider/${riderId}`;

    try {
      this.wsConnection = new WebSocket(wsEndpoint);

      this.wsConnection.onopen = () => {
        console.log('[FarmMaps] 骑手追踪连接已建立, riderId:', riderId);
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'POSITION_UPDATE') {
            const position = {
              lat: data.lat,
              lng: data.lng,
              timestamp: data.timestamp,
              accuracy: data.accuracy || null,
              riderId: data.riderId
            };

            // 更新骑手标记位置
            this._updateRiderMarker(position, data.riderName || '骑手');
            positionCallback(position);
          }
        } catch (err) {
          console.error('[FarmMaps] 解析位置数据失败:', err);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error('[FarmMaps] WebSocket错误:', error);
      };

      this.wsConnection.onclose = () => {
        console.log('[FarmMaps] 骑手追踪连接已关闭');
      };

    } catch (err) {
      console.error('[FarmMaps] 连接追踪服务器失败:', err);
    }
  }

  /**
   * 更新骑手标记
   * @private
   * @param {Object} position - { lat, lng }
   * @param {string} riderName - 骑手名称
   */
  _updateRiderMarker(position, riderName) {
    // 查找现有骑手标记
    let riderMarker = this.markers.find(m => m.getTitle() === riderName);

    const riderIcon = {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="#FF9800" stroke="#fff" stroke-width="2"/>
          <text x="18" y="23" text-anchor="middle" fill="#fff" font-size="14">🛵</text>
        </svg>
      `),
      scaledSize: new google.maps.Size(36, 36),
      anchor: new google.maps.Point(18, 18)
    };

    if (riderMarker) {
      riderMarker.setPosition(position);
    } else {
      this.addMarker(position, riderName, riderIcon, `
        <div style="padding:8px;">
          <h4 style="margin:0 0 6px;">🛵 ${riderName}</h4>
          <p style="margin:0;font-size:12px;">正在配送中...</p>
        </div>
      `);
    }
  }

  /**
   * 获取距离矩阵（批量距离计算）
   * @param {Array<Object>} origins - 起点数组 [{lat,lng}]
   * @param {Array<Object>} destinations - 终点数组 [{lat,lng}]
   * @param {string} mode - 出行方式
   * @returns {Promise<Object>}
   */
  async getDistanceMatrix(origins, destinations, mode = 'DRIVING') {
    return new Promise((resolve, reject) => {
      const service = new google.maps.DistanceMatrixService();

      service.getDistanceMatrix(
        {
          origins,
          destinations,
          travelMode: google.maps.TravelMode[mode] || google.maps.TravelMode.DRIVING,
          unitSystem: google.maps.UnitSystem.METRIC,
          region: 'KH'
        },
        (response, status) => {
          if (status === 'OK') {
            resolve(response);
          } else {
            reject(new Error(`距离矩阵计算失败: ${status}`));
          }
        }
      );
    });
  }

  /**
   * 清除所有标记
   */
  clearMarkers() {
    this.markers.forEach(marker => marker.setMap(null));
    this.markers = [];
  }

  /**
   * 清除配送范围显示
   */
  clearDeliveryRange() {
    if (this.deliveryCircle) {
      this.deliveryCircle.setMap(null);
      this.deliveryCircle = null;
    }
  }

  /**
   * 清除路线
   */
  clearRoute() {
    if (this.directionsRenderer) {
      this.directionsRenderer.setDirections({ routes: [] });
    }
  }

  /**
   * 销毁实例
   */
  destroy() {
    this.clearMarkers();
    this.clearDeliveryRange();
    this.clearRoute();

    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }

    if (this.map) {
      this.map = null;
    }

    console.log('[FarmMaps] 实例已销毁');
  }
}

// 导出到全局
window.FarmMaps = FarmMaps;
window.MapsConfig = MapsConfig;

// 同时支持ES Module和CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FarmMaps, MapsConfig };
}
