/**
 * ============================================================
 * ABA PayWay 配置模块
 * ============================================================
 * 管理ABA Bank PayWay支付网关的配置参数，
 * 支持从环境变量读取，也支持程序化配置。
 * 参考文档：https://www.payway.com.kh/developers
 * ============================================================
 */

const { ConfigurationError } = require('../common/error');

/**
 * ABA PayWay 支持的货币代码
 */
const SUPPORTED_CURRENCIES = ['USD', 'KHR'];

/**
 * ABA PayWay 支持的支付方式
 */
const PAYMENT_METHODS = {
  ABA_PAY: 'abapay',        // ABA移动应用扫码支付
  ABA_PAY_DEEP_LINK: 'abapay_deeplink', // ABA应用深度链接
  CARDS: 'cards',           // 信用卡/借记卡
  ALIPAY: 'alipay',         // 支付宝
  WECHAT: 'wechat',         // 微信支付
}
;

/**
 * ABA PayWay 支付状态码映射
 * 文档参考值：0=成功，1=失败，2=待处理
 */
const STATUS_CODES = {
  0: 'success',   // 支付成功
  1: 'failed',    // 支付失败
  2: 'pending',   // 待处理/处理中
};

/**
 * 获取ABA配置（从环境变量或传入参数）
 *
 * @param {object} overrides - 覆盖环境变量的配置项
 * @returns {object} ABA网关配置对象
 * @throws {ConfigurationError} 必要配置缺失时抛出
 */
function getConfig(overrides = {}) {
  const config = {
    merchantId: overrides.merchantId || process.env.ABA_MERCHANT_ID,
    apiKey: overrides.apiKey || process.env.ABA_API_KEY,
    apiUrl: overrides.apiUrl || process.env.ABA_API_URL || 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments',
    returnUrl: overrides.returnUrl || process.env.ABA_RETURN_URL,
    cancelUrl: overrides.cancelUrl || process.env.ABA_CANCEL_URL,
    // 可选配置
    paymentOption: overrides.paymentOption || process.env.ABA_PAYMENT_OPTION || PAYMENT_METHODS.CARDS,
    enabledMethods: overrides.enabledMethods || [PAYMENT_METHODS.CARDS, PAYMENT_METHODS.ABA_PAY],
    currency: overrides.currency || process.env.ABA_CURRENCY || 'USD',
    // 超时设置（秒）
    paymentTimeout: overrides.paymentTimeout || 900, // 15分钟
    // 是否启用沙箱环境
    sandbox: overrides.sandbox || process.env.ABA_SANDBOX === 'true' || false,
    // 自定义HTTP配置
    httpConfig: overrides.httpConfig || {},
  };

  // 沙箱环境使用测试地址
  if (config.sandbox) {
    config.apiUrl = overrides.apiUrl || process.env.ABA_API_URL || 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments';
  }

  return config;
}

/**
 * 验证ABA配置完整性
 *
 * @param {object} config - 配置对象
 * @throws {ConfigurationError} 配置不完整时抛出
 */
function validateConfig(config) {
  if (!config.merchantId) {
    throw new ConfigurationError('ABA_MERCHANT_ID 不能为空，请在环境变量或配置中设置');
  }
  if (!config.apiKey) {
    throw new ConfigurationError('ABA_API_KEY 不能为空，请在环境变量或配置中设置');
  }
  if (!config.apiUrl) {
    throw new ConfigurationError('ABA_API_URL 不能为空');
  }
  if (!config.returnUrl) {
    throw new ConfigurationError('ABA_RETURN_URL（支付成功回调地址）不能为空');
  }

  // 验证支付方式是否有效
  if (config.paymentOption && !Object.values(PAYMENT_METHODS).includes(config.paymentOption)) {
    throw new ConfigurationError(
      `ABA 支付方式 "${config.paymentOption}" 无效，可选值: ${Object.values(PAYMENT_METHODS).join(', ')}`
    );
  }

  // 验证货币类型
  if (config.currency && !SUPPORTED_CURRENCIES.includes(config.currency.toUpperCase())) {
    throw new ConfigurationError(
      `ABA 不支持货币 "${config.currency}"，支持的货币: ${SUPPORTED_CURRENCIES.join(', ')}`
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
