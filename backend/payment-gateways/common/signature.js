/**
 * ============================================================
 * 通用签名算法模块
 * ============================================================
 * 提供基于HMAC-SHA256的通用签名和验签功能，
 * 支持柬埔寨三大支付网关（ABA、Wing、ACLEDA）的签名需求。
 * 同时提供辅助函数：参数排序、Base64编解码、随机字符串生成等。
 * ============================================================
 */

const crypto = require('crypto');

/**
 * 使用HMAC-SHA256算法对数据进行签名
 *
 * @param {string} data - 待签名的原始字符串
 * @param {string} secret - 签名密钥（API Key）
 * @param {string} outputFormat - 输出格式：'hex' | 'base64'，默认'base64'
 * @returns {string} HMAC-SHA256签名结果
 */
function hmacSha256Sign(data, secret, outputFormat = 'base64') {
  if (!data || !secret) {
    throw new Error('签名数据和密钥不能为空');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(data, 'utf8')
    .digest(outputFormat);
}

/**
 * 验证HMAC-SHA256签名
 *
 * @param {string} data - 原始数据字符串
 * @param {string} signature - 待验证的签名
 * @param {string} secret - 签名密钥
 * @param {string} inputFormat - 签名输入格式：'hex' | 'base64'，默认'base64'
 * @returns {boolean} 签名是否有效
 */
function hmacSha256Verify(data, signature, secret, inputFormat = 'base64') {
  if (!data || !signature || !secret) {
    return false;
  }
  const computed = hmacSha256Sign(data, secret, inputFormat);
  // 使用固定时间比较防止时序攻击
  return crypto.timingSafeEqual(Buffer.from(computed, inputFormat), Buffer.from(signature, inputFormat));
}

/**
 * 计算SHA-256哈希值（用于非HMAC场景，如生成交易哈希）
 *
 * @param {string} data - 待哈希的数据
 * @param {string} outputFormat - 输出格式：'hex' | 'base64'，默认'hex'
 * @returns {string} SHA-256哈希值
 */
function sha256Hash(data, outputFormat = 'hex') {
  return crypto.createHash('sha256').update(data, 'utf8').digest(outputFormat);
}

/**
 * 将对象按键名字母顺序排序后序列化为查询字符串
 * 适用于需要按字母排序参数后签名的场景（如ACLEDA PayGo）
 *
 * @param {object} params - 参数对象
 * @param {string[]} excludeKeys - 需要排除的键名（如sign、signature等）
 * @returns {string} 排序后的查询参数字符串，如 a=1&b=2&c=3
 */
function sortParamsToString(params, excludeKeys = []) {
  const sortedKeys = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && !excludeKeys.includes(key))
    .sort();

  return sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

/**
 * 生成安全的随机字符串（用于交易ID、nonce等）
 *
 * @param {number} length - 字符串长度，默认16
 * @returns {string} 随机十六进制字符串
 */
function generateRandomString(length = 16) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * 生成UUID v4（通用唯一识别码）
 * 适用于需要全局唯一标识的场景
 *
 * @returns {string} UUID格式字符串
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * 生成带前缀的交易ID
 *
 * @param {string} prefix - 前缀，如'ABA'、'WING'、'ACLD'
 * @param {string} orderId - 商户订单ID
 * @returns {string} 格式化的交易ID
 */
function generateTransactionId(prefix, orderId) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = generateRandomString(6);
  return `${prefix}_${orderId}_${timestamp}_${random}`;
}

/**
 * Base64编码
 *
 * @param {string} data - 原始字符串
 * @returns {string} Base64编码结果
 */
function base64Encode(data) {
  return Buffer.from(data, 'utf8').toString('base64');
}

/**
 * Base64解码
 *
 * @param {string} encoded - Base64编码字符串
 * @returns {string} 解码后的原始字符串
 */
function base64Decode(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

/**
 * 拼接多个字段并签名（常用于ABA PayWay格式）
 * 格式：将多个字段按顺序拼接成一个字符串
 *
 * @param {string[]} fields - 待拼接的字段数组
 * @param {string} secret - 签名密钥
 * @param {string} separator - 字段分隔符，默认''
 * @returns {string} 签名结果
 */
function signConcatenatedFields(fields, secret, separator = '') {
  const data = fields.join(separator);
  return hmacSha256Sign(data, secret, 'base64');
}

/**
 * 使用RSA-SHA256进行签名（适用于部分高级网关需求）
 *
 * @param {string} data - 待签名数据
 * @param {string} privateKey - PEM格式的RSA私钥
 * @returns {string} Base64编码的签名
 */
function rsaSign(data, privateKey) {
  return crypto.createSign('RSA-SHA256').update(data, 'utf8').sign(privateKey, 'base64');
}

/**
 * 使用RSA-SHA256验证签名
 *
 * @param {string} data - 原始数据
 * @param {string} signature - Base64编码的签名
 * @param {string} publicKey - PEM格式的RSA公钥
 * @returns {boolean} 签名是否有效
 */
function rsaVerify(data, signature, publicKey) {
  try {
    return crypto.createVerify('RSA-SHA256').update(data, 'utf8').verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

module.exports = {
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
  rsaSign,
  rsaVerify,
};
