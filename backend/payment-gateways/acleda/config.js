/**
 * ============================================================
 * ACLEDA Bank PayGo 配置模块
 * ============================================================
 * 管理ACLEDA Bank PayGo支付网关的配置参数，
 * 支持从环境变量读取，也支持程序化配置。
 * 参考文档：https://www.acledabank.com.kh/merchant
 * ============================================================
 */

const { ConfigurationError } = require('../common/error');

/**
 * ACLEDA PayGo 支持的货币代码
 */
const SUPPORTED_CURRENCIES = ['USD', 'KHR', 'THB'];

/**
 * ACLEDA PayGo 支持的支付方式
 */
const PAYMENT_METHODS = {
  ACLEDA_ACCOUNT: 'acleda_account', // ACLEDA银行账户支付
  CREDIT_CARD: 'credit_card',       // 国际信用卡（Visa/Mastercard/JCB）
  DEBIT_CARD: 'debit_card',         // 借记卡
  PAYGO_QR: 'paygo_qr',             // PayGo二维码
  KHQR: 'khqr',                     // 柬埔寨国家二维码标准（Bakong KHQR）
};

/**
 * ACLEDA PayGo 交易状态映射
 */
const STATUS_CODES = {
  0: 'success',    // 交易成功
  1: 'pending',    // 待处理
  2: 'failed',     // 交易失败
  3: 'cancelled',  // 已取消
  4: 'expired',    // 已过期
  5: 'refunded',   // 已退款
};

/**
 * 获取ACLEDA PayGo配置
 *
 * @param {object} overrides - 覆盖环境变量的配置项
 * @returns {object} ACLEDA网关配置对象
 * @throws {ConfigurationError} 必要配置缺失时抛出
 */
function getConfig(overrides = {}) {
  const config = {
    merchantId: overrides.merchantId || process.env.ACLEDA_MERCHANT_ID,
    apiKey: overrides.apiKey || process.env.ACLEDA_API_KEY,
    merchantName: overrides.merchantName || process.env.ACLEDA_MERCHANT_NAME,
    apiUrl: overrides.apiUrl || process.env.ACLEDA_API_URL || 'https://api.acledabank.com.kh/paygo/v1',
    returnUrl: overrides.returnUrl || process.env.ACLEDA_RETURN_URL,
    cancelUrl: overrides.cancelUrl || process.env.ACLEDA_CANCEL_URL,
    // ACLEDA特有的商户证书配置（用于RSA签名）
    merchantCert: overrides.merchantCert || process.env.ACLEDA_MERCHANT_CERT,
    // 可选配置
    paymentMethod: overrides.paymentMethod || process.env.ACLEDA_PAYMENT_METHOD || PAYMENT_METHODS.CREDIT_CARD,
    currency: overrides.currency || process.env.ACLEDA_CURRENCY || 'USD',
    // 超时设置（秒）
    paymentTimeout: overrides.paymentTimeout || 900, // 15分钟
    // 是否启用沙箱环境
    sandbox: overrides.sandbox || process.env.ACLEDA_SANDBOX === 'true' || false,
    // 自定义HTTP配置
    httpConfig: overrides.httpConfig || {},
  };

  // 沙箱环境使用测试地址
  if (config.sandbox) {
    config.apiUrl = overrides.apiUrl || process.env.ACLEDA_API_URL || 'https://api-sandbox.acledabank.com.kh/paygo/v1';
  }

  return config;
}

/**
 * 验证ACLEDA配置完整性
 *
 * @param {object} config - 配置对象
 * @throws {ConfigurationError} 配置不完整时抛出
 */
function validateConfig(config) {
  if (!config.merchantId) {
    throw new ConfigurationError('ACLEDA_MERCHANT_ID 不能为空，请在环境变量或配置中设置');
  }
  if (!config.apiKey) {
    throw new ConfigurationError('ACLEDA_API_KEY 不能为空，请在环境变量或配置中设置');
  }
  if (!config.merchantName) {
    throw new ConfigurationError('ACLEDA_MERCHANT_NAME（商户显示名称）不能为空');
  }
  if (!config.apiUrl) {
    throw new ConfigurationError('ACLEDA_API_URL 不能为空');
  }
  if (!config.returnUrl) {
    throw new ConfigurationError('ACLEDA_RETURN_URL（支付成功回调地址）不能为空');
  }

  // 验证支付方式是否有效
  if (config.paymentMethod && !Object.values(PAYMENT_METHODS).includes(config.paymentMethod)) {
    throw new ConfigurationError(
      `ACLEDA 支付方式 "${config.paymentMethod}" 无效，可选值: ${Object.values(PAYMENT_METHODS).join(', ')}`
    );
  }

  // 验证货币类型
  if (config.currency && !SUPPORTED_CURRENCIES.includes(config.currency.toUpperCase())) {
    throw new ConfigurationError(
      `ACLEDA 不支持货币 "${config.currency}"，支持的货币: ${SUPPORTED_CURRENCIES.join(', ')}`
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
