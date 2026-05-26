/**
 * ============================================================
 * Wing Money 配置模块
 * ============================================================
 * 管理Wing Money支付网关的配置参数，
 * 支持从环境变量读取，也支持程序化配置。
 * 参考文档：https://www.wingmoney.com/developers
 * ============================================================
 */

const { ConfigurationError } = require('../common/error');

/**
 * Wing Money 支持的货币代码
 */
const SUPPORTED_CURRENCIES = ['USD', 'KHR'];

/**
 * Wing Money 支持的支付方式
 */
const PAYMENT_METHODS = {
  WING_ACCOUNT: 'wing_account',   // Wing账户余额支付
  WING_CARD: 'wing_card',         // Wing卡支付
  QR_CODE: 'wing_qr',             // Wing二维码支付
  QUICK_PAY: 'wing_quick_pay',    // Wing Quick Pay
};

/**
 * Wing Money 交易状态映射
 */
const STATUS_CODES = {
  SUCCESS: 'success',      // 交易成功
  PENDING: 'pending',      // 待处理
  FAILED: 'failed',        // 交易失败
  CANCELLED: 'cancelled',  // 用户取消
  EXPIRED: 'expired',      // 交易过期
  REFUNDED: 'refunded',    // 已退款
};

/**
 * 获取Wing Money配置
 *
 * @param {object} overrides - 覆盖环境变量的配置项
 * @returns {object} Wing网关配置对象
 * @throws {ConfigurationError} 必要配置缺失时抛出
 */
function getConfig(overrides = {}) {
  const config = {
    merchantId: overrides.merchantId || process.env.WING_MERCHANT_ID,
    apiKey: overrides.apiKey || process.env.WING_API_KEY,
    apiUrl: overrides.apiUrl || process.env.WING_API_URL || 'https://api.wingmoney.com/v1',
    returnUrl: overrides.returnUrl || process.env.WING_RETURN_URL,
    cancelUrl: overrides.cancelUrl || process.env.WING_CANCEL_URL,
    // Wing特有的终端号配置
    terminalId: overrides.terminalId || process.env.WING_TERMINAL_ID,
    storeId: overrides.storeId || process.env.WING_STORE_ID,
    // 可选配置
    currency: overrides.currency || process.env.WING_CURRENCY || 'USD',
    // 超时设置（秒）
    paymentTimeout: overrides.paymentTimeout || 600, // 10分钟
    // 是否启用沙箱环境
    sandbox: overrides.sandbox || process.env.WING_SANDBOX === 'true' || false,
    // 自定义HTTP配置
    httpConfig: overrides.httpConfig || {},
  };

  // 沙箱环境使用测试地址
  if (config.sandbox) {
    config.apiUrl = overrides.apiUrl || process.env.WING_API_URL || 'https://sandbox-api.wingmoney.com/v1';
  }

  return config;
}

/**
 * 验证Wing配置完整性
 *
 * @param {object} config - 配置对象
 * @throws {ConfigurationError} 配置不完整时抛出
 */
function validateConfig(config) {
  if (!config.merchantId) {
    throw new ConfigurationError('WING_MERCHANT_ID 不能为空，请在环境变量或配置中设置');
  }
  if (!config.apiKey) {
    throw new ConfigurationError('WING_API_KEY 不能为空，请在环境变量或配置中设置');
  }
  if (!config.apiUrl) {
    throw new ConfigurationError('WING_API_URL 不能为空');
  }
  if (!config.returnUrl) {
    throw new ConfigurationError('WING_RETURN_URL（支付成功回调地址）不能为空');
  }

  // 验证货币类型
  if (config.currency && !SUPPORTED_CURRENCIES.includes(config.currency.toUpperCase())) {
    throw new ConfigurationError(
      `Wing 不支持货币 "${config.currency}"，支持的货币: ${SUPPORTED_CURRENCIES.join(', ')}`
    );
  }
}

module.exports = {
  SUPPORTED_CURRENCIES,
  PAYMENT_METHODS,
  STATUS_CODES,
  getConfig,
  validateConfig,
};
