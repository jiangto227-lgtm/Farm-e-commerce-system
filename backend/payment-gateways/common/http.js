/**
 * ============================================================
 * HTTP请求封装模块
 * ============================================================
 * 基于axios封装柬埔寨支付网关的HTTP请求，
 * 支持请求/响应拦截、超时控制、自动重试、日志记录（脱敏）、
 * 以及网络异常自动转换等功能。
 * ============================================================
 */

const axios = require('axios');
const axiosRetry = require('axios-retry');
const { NetworkError, PaymentTimeoutError, ValidationError } = require('./error');

// 创建axios实例的工厂函数
function createHttpClient(baseConfig = {}) {
  const client = axios.create({
    timeout: 30000, // 默认30秒超时
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...baseConfig,
  });

  // 配置自动重试：最多3次，使用指数退避策略
  axiosRetry(client, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      // 仅在网络错误或5xx服务器错误时重试
      return axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response?.status >= 500);
    },
    onRetry: (retryCount, error, requestConfig) => {
      console.warn(
        `[HTTP重试] 请求 ${requestConfig.method?.toUpperCase()} ${requestConfig.url} ` +
          `第 ${retryCount} 次重试，原因：${error.message}`
      );
    },
  });

  // ========== 请求拦截器 ==========
  client.interceptors.request.use(
    (config) => {
      // 记录脱敏后的请求日志
      const logData = {
        method: config.method?.toUpperCase(),
        url: config.url,
        headers: sanitizeHeaders(config.headers),
        params: config.params ? sanitizeSensitiveData(config.params) : undefined,
        data: config.data ? sanitizeSensitiveData(config.data) : undefined,
        timestamp: new Date().toISOString(),
      };
      console.log(`[HTTP请求] ${JSON.stringify(logData)}`);
      return config;
    },
    (error) => {
      console.error(`[HTTP请求错误] ${error.message}`);
      return Promise.reject(new NetworkError('构建HTTP请求失败', { originalError: error.message }));
    }
  );

  // ========== 响应拦截器 ==========
  client.interceptors.response.use(
    (response) => {
      // 记录脱敏后的响应日志
      const logData = {
        status: response.status,
        statusText: response.statusText,
        data: sanitizeSensitiveData(response.data),
        timestamp: new Date().toISOString(),
      };
      console.log(`[HTTP响应] ${JSON.stringify(logData)}`);
      return response;
    },
    (error) => {
      // 统一处理各类HTTP错误
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return Promise.reject(
          new PaymentTimeoutError('请求支付网关超时', {
            code: error.code,
            url: error.config?.url,
          })
        );
      }

      if (error.response) {
        // 网关返回了错误响应（4xx/5xx）
        const status = error.response.status;
        const data = error.response.data;

        if (status >= 500) {
          return Promise.reject(
            new NetworkError(`支付网关服务器错误 (${status})`, {
              status,
              response: sanitizeSensitiveData(data),
            })
          );
        }

        if (status === 400) {
          return Promise.reject(
            new ValidationError(`请求参数错误 (${status})`, {
              status,
              response: sanitizeSensitiveData(data),
            })
          );
        }

        return Promise.reject(
          new NetworkError(`HTTP错误 ${status}`, {
            status,
            response: sanitizeSensitiveData(data),
          })
        );
      }

      if (error.request) {
        // 请求发出但未收到响应
        return Promise.reject(
          new NetworkError('无法连接到支付网关，请检查网络', {
            code: error.code,
            url: error.config?.url,
          })
        );
      }

      return Promise.reject(new NetworkError(`请求异常: ${error.message}`));
    }
  );

  return client;
}

/**
 * 脱敏处理HTTP请求头，移除敏感信息
 *
 * @param {object} headers - 原始请求头
 * @returns {object} 脱敏后的请求头
 */
function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return headers;

  const sensitiveKeys = ['authorization', 'x-api-key', 'api-key', 'x-secret', 'cookie', 'set-cookie'];
  const sanitized = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '***REDACTED***';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * 脱敏处理数据对象中的敏感字段
 * 递归处理嵌套对象，对匹配的字段值进行掩码处理
 *
 * @param {*} data - 原始数据
 * @returns {*} 脱敏后的数据
 */
function sanitizeSensitiveData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map((item) => sanitizeSensitiveData(item));

  const sensitiveFields = [
    'api_key',
    'apiKey',
    'apikey',
    'secret',
    'password',
    'token',
    'access_token',
    'card_number',
    'cardNumber',
    'cvv',
    'pin',
    'hash',
    'signature',
    'private_key',
    'privateKey',
    'merchant_id',
    'tran_id',
  ];

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((sf) => lowerKey.includes(sf)) && typeof value === 'string') {
      // 只显示前4位和最后2位，中间用***代替
      sanitized[key] = value.length > 6 ? value.slice(0, 4) + '***' + value.slice(-2) : '***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * GET请求便捷方法
 *
 * @param {string} url - 请求URL
 * @param {object} params - URL查询参数
 * @param {object} config - 额外axios配置
 */
async function httpGet(url, params = {}, config = {}) {
  const client = createHttpClient();
  return client.get(url, { params, ...config });
}

/**
 * POST请求便捷方法
 *
 * @param {string} url - 请求URL
 * @param {object} data - 请求体数据
 * @param {object} config - 额外axios配置
 */
async function httpPost(url, data = {}, config = {}) {
  const client = createHttpClient();
  return client.post(url, data, config);
}

/**
 * PUT请求便捷方法
 *
 * @param {string} url - 请求URL
 * @param {object} data - 请求体数据
 * @param {object} config - 额外axios配置
 */
async function httpPut(url, data = {}, config = {}) {
  const client = createHttpClient();
  return client.put(url, data, config);
}

module.exports = {
  createHttpClient,
  sanitizeSensitiveData,
  sanitizeHeaders,
  httpGet,
  httpPost,
  httpPut,
};
