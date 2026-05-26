/**
 * ============================================================
 * 柬埔寨支付网关SDK - 统一入口
 * ============================================================
 * 提供对柬埔寨三大本地支付网关的统一封装：
 *  - ABA Bank PayWay (https://www.payway.com.kh/)
 *  - Wing Money (https://www.wingmoney.com/)
 *  - ACLEDA Bank PayGo (https://www.acledabank.com.kh/)
 *
 * 使用方式：
 *   const { createABA, createWing, createACLED, PaymentCallbackHandler } = require('./payment-gateways');
 *
 *   // 创建网关实例
 *   const aba = createABA({ merchantId: 'xxx', apiKey: 'xxx' });
 *   const wing = createWing({ merchantId: 'xxx', apiKey: 'xxx' });
 *   const acleda = createACLED({ merchantId: 'xxx', apiKey: 'xxx', merchantName: 'My Shop' });
 *
 *   // 创建支付
 *   const result = await aba.createPayment({
 *     orderId: 'ORDER_123',
 *     amount: 10.50,
 *     currency: 'USD',
 *     description: '商品购买',
 *     returnUrl: 'https://example.com/payment/success',
 *     cancelUrl: 'https://example.com/payment/cancel',
 *   });
 *
 *   // 处理回调
 *   const handler = new PaymentCallbackHandler({ abaGateway: aba, wingGateway: wing });
 *   const callbackResult = await handler.handle('ABA_PAYWAY', req.query, req.query.hash);
 *
 * ============================================================
 */

// ========== 基类 ==========
const Gateway = require('./base/Gateway');

// ========== 网关实现 ==========
const ABAGateway = require('./aba/ABAGateway');
const WingGateway = require('./wing/WingGateway');
const ACLEDAGateway = require('./acleda/ACLEDAGateway');

// ========== 回调处理 ==========
const { PaymentCallbackHandler, CALLBACK_RESULT } = require('./callback/handler');

// ========== 通用工具 ==========
const {
  hmacSha256Sign,
  hmacSha256Verify,
  sha256Hash,
  sortParamsToString,
  generateRandomString,
  generateUUID,
  generateTransactionId,
  base64Encode,
  base64Decode,
  signConcatenatedFields,
} = require('./common/signature');

const { createHttpClient, sanitizeSensitiveData } = require('./common/http');

const {
  PaymentError,
  SignatureError,
  NetworkError,
  PaymentStatusError,
  AmountMismatchError,
  PaymentTimeoutError,
  ConfigurationError,
  GatewayDeclinedError,
  IdempotencyError,
  RefundError,
  ValidationError,
} = require('./common/error');

// ========== 配置模块 ==========
const abaConfig = require('./aba/config');
const wingConfig = require('./wing/config');
const acledaConfig = require('./acleda/config');

// ============================================================
// 工厂函数 - 简化网关创建
// ============================================================

/**
 * 创建ABA PayWay网关实例
 *
 * @param {object} overrides - 覆盖配置
 * @returns {ABAGateway} ABA网关实例
 *
 * @example
 * const aba = createABA({
 *   merchantId: 'your_merchant_id',
 *   apiKey: 'your_api_key',
 *   returnUrl: 'https://your-site.com/payment/success',
 * });
 */
function createABA(overrides = {}) {
  return new ABAGateway(overrides);
}

/**
 * 创建Wing Money网关实例
 *
 * @param {object} overrides - 覆盖配置
 * @returns {WingGateway} Wing网关实例
 *
 * @example
 * const wing = createWing({
 *   merchantId: 'your_merchant_id',
 *   apiKey: 'your_api_key',
 *   returnUrl: 'https://your-site.com/payment/success',
 * });
 */
function createWing(overrides = {}) {
  return new WingGateway(overrides);
}

/**
 * 创建ACLEDA PayGo网关实例
 *
 * @param {object} overrides - 覆盖配置
 * @returns {ACLEDAGateway} ACLEDA网关实例
 *
 * @example
 * const acleda = createACLED({
 *   merchantId: 'your_merchant_id',
 *   apiKey: 'your_api_key',
 *   merchantName: 'Your Shop Name',
 *   returnUrl: 'https://your-site.com/payment/success',
 * });
 */
function createACLED(overrides = {}) {
  return new ACLEDAGateway(overrides);
}

/**
 * 创建统一回调处理器
 *
 * @param {object} gateways - 网关实例
 * @param {object} options - 额外选项
 * @returns {PaymentCallbackHandler} 回调处理器实例
 */
function createCallbackHandler(gateways, options = {}) {
  return new PaymentCallbackHandler(gateways, options);
}

// ============================================================
// 便捷工具函数
// ============================================================

/**
 * 获取网关支持的货币列表
 *
 * @param {string} gatewayType - 网关类型：'ABA' | 'WING' | 'ACLEDA'
 * @returns {string[]} 支持的货币代码数组
 */
function getSupportedCurrencies(gatewayType) {
  const map = {
    ABA: abaConfig.SUPPORTED_CURRENCIES,
    ABA_PAYWAY: abaConfig.SUPPORTED_CURRENCIES,
    WING: wingConfig.SUPPORTED_CURRENCIES,
    WING_MONEY: wingConfig.SUPPORTED_CURRENCIES,
    ACLEDA: acledaConfig.SUPPORTED_CURRENCIES,
    ACLEDA_PAYGO: acledaConfig.SUPPORTED_CURRENCIES,
  };
  return map[gatewayType] || ['USD'];
}

/**
 * 获取网关支持的支付方式
 *
 * @param {string} gatewayType - 网关类型
 * @returns {object} 支持的支付方式
 */
function getSupportedPaymentMethods(gatewayType) {
  const map = {
    ABA: abaConfig.PAYMENT_METHODS,
    ABA_PAYWAY: abaConfig.PAYMENT_METHODS,
    WING: wingConfig.PAYMENT_METHODS,
    WING_MONEY: wingConfig.PAYMENT_METHODS,
    ACLEDA: acledaConfig.PAYMENT_METHODS,
    ACLEDA_PAYGO: acledaConfig.PAYMENT_METHODS,
  };
  return map[gatewayType] || {};
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  // ========== 工厂函数 ==========
  createABA,
  createWing,
  createACLED,
  createCallbackHandler,

  // ========== 类定义 ==========
  Gateway,
  ABAGateway,
  WingGateway,
  ACLEDAGateway,
  PaymentCallbackHandler,

  // ========== 常量 ==========
  CALLBACK_RESULT,

  // ========== 配置模块 ==========
  abaConfig,
  wingConfig,
  acledaConfig,

  // ========== 通用签名工具 ==========
  signature: {
    hmacSha256Sign,
    hmacSha256Verify,
    sha256Hash,
    sortParamsToString,
    generateRandomString,
    generateUUID,
    generateTransactionId,
    base64Encode,
    base64Decode,
    signConcatenatedFields,
  },

  // ========== HTTP工具 ==========
  http: {
    createHttpClient,
    sanitizeSensitiveData,
  },

  // ========== 异常类 ==========
  errors: {
    PaymentError,
    SignatureError,
    NetworkError,
    PaymentStatusError,
    AmountMismatchError,
    PaymentTimeoutError,
    ConfigurationError,
    GatewayDeclinedError,
    IdempotencyError,
    RefundError,
    ValidationError,
  },

  // ========== 便捷函数 ==========
  getSupportedCurrencies,
  getSupportedPaymentMethods,
};
