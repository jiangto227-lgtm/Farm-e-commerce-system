/**
 * ============================================================
 * Wing Money 签名/加密工具模块
 * ============================================================
 * 实现Wing Money支付网关特定的签名算法：
 * 1. HMAC-SHA256签名 - 用于API请求认证和回调验证
 * 2. 参数排序签名 - 将参数按键名排序后拼接签名（部分接口使用）
 * 3. 时间戳防重放 - 在签名中包含时间戳
 *
 * Wing Money签名规则：
 * - 将参数按ASCII码排序后拼接为 key1=value1&key2=value2 格式
 * - 或使用特定字段拼接格式（视具体接口而定）
 * - 使用HMAC-SHA256签名，输出Base64或Hex格式
 * ============================================================
 */

const { hmacSha256Sign, hmacSha256Verify, sortParamsToString, generateTransactionId } = require('../common/signature');
const { SignatureError } = require('../common/error');

/**
 * 计算Wing Money支付请求签名
 *
 * Wing Money支付签名格式（REST API）：
 * 将 merchant_id + order_id + amount + timestamp 拼接后签名
 *
 * @param {object} params - 签名参数
 * @param {string} params.merchantId - 商户ID
 * @param {string} params.orderId - 商户订单ID
 * @param {number} params.amount - 金额
 * @param {string} params.currency - 货币（默认USD）
 * @param {string} params.timestamp - 时间戳（ISO格式）
 * @param {string} apiKey - Wing API密钥
 * @returns {string} Base64编码的HMAC-SHA256签名
 */
function createPaymentSignature(params, apiKey) {
  const { merchantId, orderId, amount, currency = 'USD', timestamp } = params;

  if (!merchantId || !orderId || amount === undefined || !apiKey) {
    throw new SignatureError('创建Wing签名失败：缺少必要参数（merchantId、orderId、amount、apiKey）');
  }

  // Wing签名格式：字段拼接
  const amountStr = Number(amount).toFixed(2);
  const ts = timestamp || new Date().toISOString();
  const dataToSign = `${merchantId}${orderId}${amountStr}${currency}${ts}`;

  return hmacSha256Sign(dataToSign, apiKey, 'base64');
}

/**
 * 使用参数排序方式计算签名
 * 适用于部分需要排序参数的Wing接口
 *
 * @param {object} params - 参数对象
 * @param {string} apiKey - API密钥
 * @param {string[]} excludeKeys - 排除的键名
 * @returns {string} Base64编码签名
 */
function createSortedSignature(params, apiKey, excludeKeys = ['sign', 'signature', 'hash']) {
  if (!params || !apiKey) {
    throw new SignatureError('创建Wing排序签名失败：参数或密钥不能为空');
  }

  const sortedString = sortParamsToString(params, excludeKeys);
  return hmacSha256Sign(sortedString, apiKey, 'base64');
}

/**
 * 验证Wing Money回调签名
 *
 * Wing回调签名验证方式：
 * - 将回调参数（排除sign字段）排序后拼接
 * - 计算HMAC-SHA256并与回调中的sign比较
 *
 * @param {object} callbackParams - 回调参数对象
 * @param {string} apiKey - Wing API密钥
 * @param {string} signatureKey - 回调中存储签名的字段名，默认'sign'
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
    const computedSign = createSortedSignature(callbackParams, apiKey, [signatureKey]);

    return hmacSha256Verify(
      sortParamsToString(callbackParams, [signatureKey]),
      receivedSign,
      apiKey,
      'base64'
    );
  } catch {
    return false;
  }
}

/**
 * 计算Wing Money查询接口签名
 *
 * @param {object} params - 查询参数
 * @param {string} apiKey - API密钥
 * @returns {string} 签名
 */
function createQuerySignature(params, apiKey) {
  const { merchantId, orderId, timestamp } = params;

  if (!merchantId || !orderId || !apiKey) {
    throw new SignatureError('创建Wing查询签名失败：缺少必要参数');
  }

  const ts = timestamp || new Date().toISOString();
  const dataToSign = `${merchantId}${orderId}${ts}`;

  return hmacSha256Sign(dataToSign, apiKey, 'base64');
}

/**
 * 计算Wing Money退款接口签名
 *
 * @param {object} params - 退款参数
 * @param {string} apiKey - API密钥
 * @returns {string} 签名
 */
function createRefundSignature(params, apiKey) {
  const { merchantId, originalOrderId, refundAmount, refundId, timestamp } = params;

  if (!merchantId || !originalOrderId || refundAmount === undefined || !apiKey) {
    throw new SignatureError('创建Wing退款签名失败：缺少必要参数');
  }

  const amountStr = Number(refundAmount).toFixed(2);
  const ts = timestamp || new Date().toISOString();
  const dataToSign = `${merchantId}${originalOrderId}${amountStr}${refundId || ''}${ts}`;

  return hmacSha256Sign(dataToSign, apiKey, 'base64');
}

/**
 * 生成Wing交易ID
 * 格式：WING_{orderId}_{timestamp}_{random}
 *
 * @param {string} orderId - 商户订单ID
 * @returns {string} Wing格式的交易ID
 */
function generateWingTransactionId(orderId) {
  return generateTransactionId('WING', orderId);
}

/**
 * 构建Wing Money支付请求参数
 *
 * @param {object} params - 支付参数
 * @param {string} apiKey - API密钥
 * @returns {object} 完整的请求参数（包含签名和时间戳）
 */
function buildPaymentRequest(params, apiKey) {
  const {
    merchantId,
    orderId,
    amount,
    currency = 'USD',
    description,
    returnUrl,
    cancelUrl,
    paymentMethod,
    customerInfo,
  } = params;

  const timestamp = new Date().toISOString();

  // 计算签名
  const sign = createPaymentSignature(
    {
      merchantId,
      orderId,
      amount,
      currency,
      timestamp,
    },
    apiKey
  );

  // 构建请求参数
  const requestData = {
    merchant_id: merchantId,
    order_id: orderId,
    amount: Number(amount).toFixed(2),
    currency: currency.toUpperCase(),
    description: description || 'Payment',
    timestamp: timestamp,
    sign: sign,
    return_url: returnUrl,
    cancel_url: cancelUrl || returnUrl,
  };

  // 可选参数
  if (paymentMethod) {
    requestData.payment_method = paymentMethod;
  }
  if (customerInfo) {
    requestData.customer = customerInfo;
  }

  return requestData;
}

module.exports = {
  createPaymentSignature,
  createSortedSignature,
  verifyCallbackSignature,
  createQuerySignature,
  createRefundSignature,
  generateWingTransactionId,
  buildPaymentRequest,
};
