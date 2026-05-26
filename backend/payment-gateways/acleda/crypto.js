/**
 * ============================================================
 * ACLEDA Bank PayGo 签名/加密工具模块
 * ============================================================
 * 实现ACLEDA Bank PayGo特定的签名算法：
 * 1. HMAC-SHA256签名 - 用于API请求认证和回调验证
 * 2. 参数排序签名 - 将参数按键名ASCII排序后拼接
 * 3. Base64编码输出
 *
 * ACLEDA PayGo签名规则：
 * - 将参数按键名升序排序
 * - 拼接为 key1=value1&key2=value2 格式
 * - 使用HMAC-SHA256签名，输出Base64
 * - 部分高级接口可能需要RSA签名（使用商户证书）
 * ============================================================
 */

const { hmacSha256Sign, hmacSha256Verify, sortParamsToString, generateTransactionId } = require('../common/signature');
const { SignatureError } = require('../common/error');

/**
 * 计算ACLEDA PayGo支付请求签名
 *
 * ACLEDA PayGo签名格式：
 * 将参数按键名排序后拼接为 key=value&key2=value2 格式，然后HMAC-SHA256签名
 *
 * @param {object} params - 签名参数对象
 * @param {string} apiKey - ACLEDA API密钥
 * @param {string[]} excludeKeys - 不参与签名的字段，默认排除sign、signature
 * @returns {string} Base64编码的HMAC-SHA256签名
 */
function createPaymentSignature(params, apiKey, excludeKeys = ['sign', 'signature', 'hash']) {
  if (!params || !apiKey) {
    throw new SignatureError('创建ACLEDA签名失败：参数或密钥不能为空');
  }

  // 参数排序并拼接
  const sortedString = sortParamsToString(params, excludeKeys);

  if (!sortedString) {
    throw new SignatureError('创建ACLEDA签名失败：没有有效的参数可签名');
  }

  return hmacSha256Sign(sortedString, apiKey, 'base64');
}

/**
 * 使用特定拼接方式计算签名（部分ACLEDA接口使用）
 * 格式：merchantId + orderId + amount + currency + timestamp
 *
 * @param {object} params - 签名参数
 * @param {string} params.merchantId - 商户ID
 * @param {string} params.orderId - 商户订单ID
 * @param {number} params.amount - 金额
 * @param {string} params.currency - 货币
 * @param {string} params.timestamp - 时间戳
 * @param {string} apiKey - API密钥
 * @returns {string} Base64编码签名
 */
function createConcatenatedSignature(params, apiKey) {
  const { merchantId, orderId, amount, currency = 'USD', timestamp } = params;

  if (!merchantId || !orderId || amount === undefined || !apiKey) {
    throw new SignatureError('创建ACLEDA拼接签名失败：缺少必要参数');
  }

  const amountStr = Number(amount).toFixed(2);
  const ts = timestamp || new Date().toISOString();
  const dataToSign = `${merchantId}${orderId}${amountStr}${currency}${ts}`;

  return hmacSha256Sign(dataToSign, apiKey, 'base64');
}

/**
 * 验证ACLEDA PayGo回调签名
 *
 * ACLEDA回调通常包含 sign 字段，验证方式：
 * - 将回调参数（排除sign字段）按键名排序后拼接
 * - 重新计算HMAC-SHA256并与回调sign比较
 *
 * @param {object} callbackParams - 回调参数对象
 * @param {string} apiKey - ACLEDA API密钥
 * @param {string} signatureKey - 签名字段名，默认'sign'
 * @returns {boolean} 签名是否有效
 */
function verifyCallbackSignature(callbackParams, apiKey, signatureKey = 'sign') {
  try {
    if (!callbackParams || !apiKey) {
      return false;
    }

    const receivedSign = callbackParams[signatureKey];
    if (!receivedSign) {
      return false;
    }

    // 排除签名字段后重新计算
    const sortedString = sortParamsToString(callbackParams, [signatureKey]);
    if (!sortedString) {
      return false;
    }

    return hmacSha256Verify(sortedString, receivedSign, apiKey, 'base64');
  } catch {
    return false;
  }
}

/**
 * 计算ACLEDA查询接口签名
 *
 * @param {object} params - 查询参数
 * @param {string} apiKey - API密钥
 * @returns {string} 签名
 */
function createQuerySignature(params, apiKey) {
  const { merchantId, orderId, timestamp } = params;

  if (!merchantId || !orderId || !apiKey) {
    throw new SignatureError('创建ACLEDA查询签名失败：缺少必要参数');
  }

  const ts = timestamp || new Date().toISOString();
  const sortedString = sortParamsToString({ merchant_id: merchantId, order_id: orderId, timestamp: ts });

  return hmacSha256Sign(sortedString, apiKey, 'base64');
}

/**
 * 计算ACLEDA退款接口签名
 *
 * @param {object} params - 退款参数
 * @param {string} apiKey - API密钥
 * @returns {string} 签名
 */
function createRefundSignature(params, apiKey) {
  const { merchantId, originalOrderId, refundAmount, refundId, timestamp } = params;

  if (!merchantId || !originalOrderId || refundAmount === undefined || !apiKey) {
    throw new SignatureError('创建ACLEDA退款签名失败：缺少必要参数');
  }

  const amountStr = Number(refundAmount).toFixed(2);
  const ts = timestamp || new Date().toISOString();

  const signParams = {
    merchant_id: merchantId,
    original_order_id: originalOrderId,
    refund_amount: amountStr,
    refund_id: refundId || '',
    timestamp: ts,
  };

  return createPaymentSignature(signParams, apiKey);
}

/**
 * 生成ACLEDA交易ID
 * 格式：ACLD_{orderId}_{timestamp}_{random}
 *
 * @param {string} orderId - 商户订单ID
 * @returns {string} ACLEDA格式的交易ID
 */
function generateACLEDATransactionId(orderId) {
  return generateTransactionId('ACLD', orderId);
}

/**
 * 构建ACLEDA PayGo支付请求参数
 *
 * @param {object} params - 支付参数
 * @param {string} apiKey - API密钥
 * @returns {object} 完整的请求参数（包含签名）
 */
function buildPaymentRequest(params, apiKey) {
  const {
    merchantId,
    merchantName,
    orderId,
    amount,
    currency = 'USD',
    description,
    returnUrl,
    cancelUrl,
    paymentMethod,
    customerInfo,
    expiryMinutes,
  } = params;

  const timestamp = new Date().toISOString();

  // 构建基础参数
  const requestData = {
    merchant_id: merchantId,
    merchant_name: merchantName,
    order_id: orderId,
    amount: Number(amount).toFixed(2),
    currency: currency.toUpperCase(),
    description: description || 'Payment',
    timestamp: timestamp,
    return_url: returnUrl,
    cancel_url: cancelUrl || returnUrl,
  };

  // 可选参数
  if (paymentMethod) {
    requestData.payment_method = paymentMethod;
  }
  if (customerInfo) {
    if (customerInfo.name) requestData.customer_name = customerInfo.name;
    if (customerInfo.email) requestData.customer_email = customerInfo.email;
    if (customerInfo.phone) requestData.customer_phone = customerInfo.phone;
  }
  if (expiryMinutes) {
    requestData.expiry_minutes = expiryMinutes;
  }

  // 计算签名（排序参数后签名）
  const sign = createPaymentSignature(requestData, apiKey);
  requestData.sign = sign;

  return requestData;
}

module.exports = {
  createPaymentSignature,
  createConcatenatedSignature,
  verifyCallbackSignature,
  createQuerySignature,
  createRefundSignature,
  generateACLEDATransactionId,
  buildPaymentRequest,
};
