/**
 * ============================================================
 * ABA PayWay 签名/加密工具模块
 * ============================================================
 * 实现ABA Bank PayWay特定的签名算法：
 * 1. HMAC-SHA256签名 - 用于创建支付请求和回调验证
 * 2. 参数拼接格式 - ABA PayWay要求的特定字段拼接顺序
 * 3. Base64编码签名输出
 *
 * ABA PayWay签名规则：
 * - 将 merchant_id + transaction_id + amount + 可选字段 按顺序拼接
 * - 使用商户API Key作为密钥计算HMAC-SHA256
 * - 输出Base64编码的签名
 * ============================================================
 */

const { hmacSha256Sign, hmacSha256Verify, generateTransactionId } = require('../common/signature');
const { SignatureError } = require('../common/error');

/**
 * 计算ABA PayWay支付请求签名
 *
 * ABA PayWay要求将以下字段按顺序拼接后签名：
 *   merchant_id + transaction_id + amount + currency + description
 *
 * @param {object} params - 签名参数
 * @param {string} params.merchantId - 商户ID
 * @param {string} params.transactionId - 交易ID
 * @param {number} params.amount - 金额
 * @param {string} params.currency - 货币（默认USD）
 * @param {string} params.description - 描述
 * @param {string} apiKey - ABA API密钥
 * @returns {string} Base64编码的HMAC-SHA256签名
 */
function createPaymentSignature(params, apiKey) {
  const { merchantId, transactionId, amount, currency = 'USD', description } = params;

  if (!merchantId || !transactionId || amount === undefined || !apiKey) {
    throw new SignatureError('创建ABA签名失败：缺少必要参数（merchantId、transactionId、amount、apiKey）');
  }

  // ABA PayWay签名格式：字段直接拼接（无分隔符）
  // 注意：金额必须格式化为保留2位小数的字符串
  const amountStr = Number(amount).toFixed(2);
  const dataToSign = `${merchantId}${transactionId}${amountStr}${currency}${description || ''}`;

  return hmacSha256Sign(dataToSign, apiKey, 'base64');
}

/**
 * 验证ABA PayWay回调签名
 *
 * ABA回调参数中通常包含 hash 字段，需要验证其合法性。
 * 回调签名格式：merchant_id + transaction_id + amount + status
 *
 * @param {object} params - 回调参数
 * @param {string} params.merchantId - 商户ID
 * @param {string} params.transactionId - 交易ID
 * @param {number} params.amount - 金额
 * @param {string} params.status - 支付状态码
 * @param {string} signature - 待验证的签名（回调中的hash字段）
 * @param {string} apiKey - ABA API密钥
 * @returns {boolean} 签名是否有效
 */
function verifyCallbackSignature(params, signature, apiKey) {
  try {
    const { merchantId, transactionId, amount, status } = params;

    if (!merchantId || !transactionId || amount === undefined || !status || !signature || !apiKey) {
      return false;
    }

    const amountStr = Number(amount).toFixed(2);
    const dataToVerify = `${merchantId}${transactionId}${amountStr}${status}`;

    return hmacSha256Verify(dataToVerify, signature, apiKey, 'base64');
  } catch {
    return false;
  }
}

/**
 * 验证ABA PayWay查询接口签名
 * 用于查询交易状态时构建签名
 *
 * @param {object} params - 查询参数
 * @param {string} apiKey - API密钥
 * @returns {string} 签名
 */
function createQuerySignature(params, apiKey) {
  const { merchantId, transactionId } = params;

  if (!merchantId || !transactionId || !apiKey) {
    throw new SignatureError('创建ABA查询签名失败：缺少必要参数');
  }

  const dataToSign = `${merchantId}${transactionId}`;
  return hmacSha256Sign(dataToSign, apiKey, 'base64');
}

/**
 * 生成ABA交易ID
 * 格式：ABA_{orderId}_{timestamp}_{random}
 *
 * @param {string} orderId - 商户订单ID
 * @returns {string} ABA格式的交易ID
 */
function generateABATransactionId(orderId) {
  return generateTransactionId('ABA', orderId);
}

/**
 * 构建ABA PayWay表单参数
 * 用于生成跳转到ABA支付页面的HTML表单数据
 *
 * @param {object} params - 支付参数
 * @param {string} apiKey - API密钥
 * @returns {object} 完整的表单参数（包含hash签名）
 */
function buildPaymentForm(params, apiKey) {
  const {
    merchantId,
    transactionId,
    amount,
    currency = 'USD',
    description,
    returnUrl,
    cancelUrl,
    paymentOption,
  } = params;

  // 计算签名
  const hash = createPaymentSignature(
    {
      merchantId,
      transactionId,
      amount,
      currency,
      description,
    },
    apiKey
  );

  // 构建表单参数（字段名使用ABA PayWay规定的格式）
  const formData = {
    merchant_id: merchantId,
    tran_id: transactionId,
    amount: Number(amount).toFixed(2),
    currency: currency.toUpperCase(),
    description: description || 'Payment',
    hash: hash,
    return_url: returnUrl,
    cancel_url: cancelUrl || returnUrl,
  };

  // 可选：指定支付方式
  if (paymentOption) {
    formData.payment_option = paymentOption;
  }

  return formData;
}

module.exports = {
  createPaymentSignature,
  verifyCallbackSignature,
  createQuerySignature,
  generateABATransactionId,
  buildPaymentForm,
};
