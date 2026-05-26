/**
 * ============================================================
 * ABA PayWay 网关实现
 * ============================================================
 * 对接柬埔寨ABA Bank的PayWay支付网关。
 * 支持信用卡/借记卡支付和ABA Pay移动应用支付。
 *
 * 支付流程：
 *  1. createPayment → 生成带签名的支付表单参数
 *  2. 商户后端将参数提交到ABA PayWay托管页面
 *  3. 用户完成支付 → ABA回调到returnUrl
 *  4. handleCallback → 验证签名 → 返回标准化结果
 *
 * 安全性：
 *  - 所有请求使用HMAC-SHA256签名
 *  - 回调验证签名防止伪造
 *  - 金额校验确保数据完整性
 * ============================================================
 */

const Gateway = require('../base/Gateway');
const { createHttpClient } = require('../common/http');
const { getConfig, validateConfig, STATUS_CODES, PAYMENT_METHODS } = require('./config');
const {
  createPaymentSignature,
  verifyCallbackSignature,
  createQuerySignature,
  generateABATransactionId,
  buildPaymentForm,
} = require('./crypto');
const {
  SignatureError,
  AmountMismatchError,
  PaymentStatusError,
  NetworkError,
  RefundError,
  ValidationError,
} = require('../common/error');

class ABAGateway extends Gateway {
  /**
   * 创建ABA PayWay网关实例
   *
   * @param {object} overrides - 覆盖默认配置的配置项
   */
  constructor(overrides = {}) {
    const config = getConfig(overrides);
    super('ABA_PAYWAY', config);
    validateConfig(config);

    // 创建专用HTTP客户端
    this.httpClient = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: this.config.httpConfig.timeout || 30000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      ...this.config.httpConfig,
    });
  }

  /**
   * 验证配置
   */
  validateConfig(config) {
    super.validateConfig(config);
    validateConfig(config);
  }

  /**
   * 创建支付请求
   * 生成ABA PayWay支付表单所需的所有参数（含签名）
   *
   * @param {object} params - 支付参数
   * @param {string} params.orderId - 商户订单ID（必填）
   * @param {number} params.amount - 支付金额，必须>0（必填）
   * @param {string} params.currency - 货币代码，默认USD
   * @param {string} params.description - 商品描述（必填）
   * @param {string} params.returnUrl - 支付成功回调URL（必填）
   * @param {string} params.cancelUrl - 支付取消回调URL（可选）
   * @param {string} params.paymentOption - 支付方式：cards/abapay/abapay_deeplink（可选）
   * @returns {Promise<object>} 支付结果，包含：
   *   - paymentUrl: ABA PayWay支付页面URL
   *   - transactionId: 生成的交易ID
   *   - hash: 签名值
   *   - formData: 完整的表单参数（可直接用于POST提交）
   */
  async createPayment(params) {
    // 1. 验证参数
    this.validateCreatePaymentParams(params);

    // 2. 生成交易ID
    const transactionId = generateABATransactionId(params.orderId);

    // 3. 构建表单参数并计算签名
    const formData = buildPaymentForm(
      {
        merchantId: this.config.merchantId,
        transactionId,
        amount: params.amount,
        currency: params.currency || this.config.currency || 'USD',
        description: params.description,
        returnUrl: params.returnUrl || this.config.returnUrl,
        cancelUrl: params.cancelUrl || this.config.cancelUrl || params.returnUrl || this.config.returnUrl,
        paymentOption: params.paymentOption || this.config.paymentOption,
      },
      this.config.apiKey
    );

    // 4. 记录日志（脱敏）
    this.log('创建支付', {
      orderId: params.orderId,
      transactionId,
      amount: params.amount,
      currency: params.currency || 'USD',
      paymentOption: params.paymentOption,
    });

    // 5. 返回标准化结果
    return this.normalizePaymentResult({
      paymentUrl: `${this.config.apiUrl}/checkout`,
      transactionId,
      orderId: params.orderId,
      amount: params.amount,
      currency: params.currency || 'USD',
      hash: formData.hash,
      formData,
      expiresAt: new Date(Date.now() + (this.config.paymentTimeout || 900) * 1000).toISOString(),
      raw: { formData },
    });
  }

  /**
   * 查询支付状态
   * 通过ABA PayWay API查询交易状态
   *
   * @param {string} transactionId - ABA交易ID
   * @returns {Promise<object>} 支付状态信息
   */
  async queryPayment(transactionId) {
    this.validateTransactionId(transactionId);

    try {
      // 构建查询参数
      const queryParams = {
        merchant_id: this.config.merchantId,
        tran_id: transactionId,
      };

      // 计算查询签名
      queryParams.hash = createQuerySignature(
        {
          merchantId: this.config.merchantId,
          transactionId,
        },
        this.config.apiKey
      );

      this.log('查询支付状态', { transactionId });

      // 调用ABA查询接口
      const response = await this.httpClient.post('/check-transaction', queryParams);

      const result = response.data;

      // 解析状态码
      const statusCode = result.status !== undefined ? result.status : result.payment_status;
      const normalizedStatus = STATUS_CODES[statusCode] || 'unknown';

      return {
        gateway: this.gatewayName,
        status: normalizedStatus,
        transactionId: transactionId,
        amount: result.amount ? parseFloat(result.amount) : null,
        currency: result.currency || 'USD',
        paidAt: result.paid_at || result.payment_datetime || null,
        gatewayReference: result.apv || result.reference || null,
        message: result.description || result.message || null,
        raw: result,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(`查询ABA交易状态失败: ${error.message}`, {
        transactionId,
        originalError: error.message,
      });
    }
  }

  /**
   * 处理支付回调
   * 验证回调签名并解析支付结果
   *
   * @param {object} query - 回调查询参数（ABA以GET查询参数形式回调）
   * @param {string} signature - 回调签名（通常包含在query的hash字段中）
   * @returns {Promise<object>} 标准化回调结果
   *
   * ABA回调参数说明：
   *   tran_id: 交易ID
   *   status: 状态码（0=成功，1=失败，2=待处理）
   *   amount: 支付金额
   *   currency: 货币
   *   hash: 签名
   */
  async handleCallback(query, signature) {
    if (!query || typeof query !== 'object') {
      throw new ValidationError('回调参数不能为空');
    }

    // ABA回调签名通常在query的hash字段中
    const callbackSignature = signature || query.hash;
    if (!callbackSignature) {
      throw new SignatureError('ABA回调缺少签名（hash字段）');
    }

    const transactionId = query.tran_id;
    const statusCode = query.status !== undefined ? parseInt(query.status, 10) : undefined;
    const amount = query.amount !== undefined ? parseFloat(query.amount) : undefined;

    if (!transactionId) {
      throw new ValidationError('ABA回调缺少交易ID（tran_id字段）');
    }

    if (statusCode === undefined) {
      throw new ValidationError('ABA回调缺少状态码（status字段）');
    }

    // 1. 验证签名
    const isValid = this.verifySignature(query, callbackSignature);

    if (!isValid) {
      this.log('回调签名验证失败', { transactionId, statusCode, receivedHash: callbackSignature });
      throw new SignatureError('ABA回调签名验证失败', {
        transactionId,
        receivedHash: callbackSignature,
      });
    }

    // 2. 解析状态
    const normalizedStatus = STATUS_CODES[statusCode];
    if (!normalizedStatus) {
      this.log('未知的回调状态码', { transactionId, statusCode });
    }

    // 3. 记录日志
    this.log('处理回调', {
      transactionId,
      statusCode,
      normalizedStatus,
      amount,
    });

    // 4. 返回标准化结果
    return this.normalizeCallbackResult({
      status: normalizedStatus || 'unknown',
      transactionId,
      orderId: this.extractOrderId(transactionId),
      amount,
      currency: query.currency || 'USD',
      paidAt: normalizedStatus === 'success' ? new Date().toISOString() : null,
      gatewayReference: query.apv || null,
      message: query.description || null,
      verified: true,
      raw: query,
    });
  }

  /**
   * 申请退款
   * 通过ABA PayWay API发起退款请求
   *
   * @param {string} transactionId - 原ABA交易ID
   * @param {number} amount - 退款金额
   * @param {string} reason - 退款原因
   * @returns {Promise<object>} 退款结果
   */
  async refund(transactionId, amount, reason) {
    this.validateRefundParams(transactionId, amount, reason);

    try {
      // 构建退款请求
      const refundId = `REF_${transactionId}_${Date.now()}`;
      const refundParams = {
        merchant_id: this.config.merchantId,
        tran_id: transactionId,
        refund_id: refundId,
        amount: Number(amount).toFixed(2),
        reason: reason,
        hash: '',
      };

      // 计算退款签名（使用商户ID+原交易ID+退款ID+金额拼接）
      const { hmacSha256Sign } = require('../common/signature');
      const signData = `${this.config.merchantId}${transactionId}${refundId}${refundParams.amount}`;
      refundParams.hash = hmacSha256Sign(signData, this.config.apiKey, 'base64');

      this.log('申请退款', {
        transactionId,
        refundId,
        amount,
        reason,
      });

      // 调用ABA退款接口
      const response = await this.httpClient.post('/refund', refundParams);
      const result = response.data;

      // 判断退款状态
      let refundStatus = 'pending';
      if (result.status === 0 || result.refund_status === 'success') {
        refundStatus = 'success';
      } else if (result.status === 1 || result.refund_status === 'failed') {
        refundStatus = 'failed';
      }

      return this.normalizeRefundResult({
        status: refundStatus,
        refundTransactionId: refundId,
        originalTransactionId: transactionId,
        amount,
        currency: result.currency || 'USD',
        reason,
        refundedAt: refundStatus === 'success' ? new Date().toISOString() : null,
        raw: result,
      });
    } catch (error) {
      if (error instanceof RefundError) {
        throw error;
      }
      throw new RefundError(`ABA退款请求失败: ${error.message}`, {
        transactionId,
        amount,
        originalError: error.message,
      });
    }
  }

  /**
   * 验证签名
   * 支持回调签名和自定义数据签名验证
   *
   * @param {object|string} payload - 待验证的数据（ABA回调通常为对象）
   * @param {string} signature - 待验证的签名
   * @returns {boolean} 签名是否有效
   */
  verifySignature(payload, signature) {
    if (!payload || !signature) {
      return false;
    }

    // ABA回调签名验证
    if (typeof payload === 'object') {
      return verifyCallbackSignature(
        {
          merchantId: this.config.merchantId,
          transactionId: payload.tran_id,
          amount: payload.amount,
          status: payload.status,
        },
        signature,
        this.config.apiKey
      );
    }

    return false;
  }

  /**
   * 生成用于直接跳转的HTML表单
   * 方便前端直接提交到ABA支付页面
   *
   * @param {object} formData - buildPaymentForm返回的表单数据
   * @returns {string} HTML表单字符串
   */
  generatePaymentFormHtml(formData) {
    if (!formData || !formData.merchant_id) {
      throw new ValidationError('表单数据不能为空');
    }

    const paymentUrl = `${this.config.apiUrl}/checkout`;

    let html = `<form id="aba-payment-form" method="POST" action="${paymentUrl}">\n`;
    for (const [key, value] of Object.entries(formData)) {
      if (value !== undefined && value !== null) {
        html += `  <input type="hidden" name="${key}" value="${this.escapeHtml(String(value))}" />\n`;
      }
    }
    html += `  <button type="submit">前往ABA PayWay支付</button>\n`;
    html += `</form>\n`;
    html += `<script>document.getElementById('aba-payment-form').submit();</script>`;

    return html;
  }

  /**
   * 从交易ID中提取商户订单ID
   * ABA交易ID格式：ABA_{orderId}_{timestamp}_{random}
   *
   * @param {string} transactionId - ABA交易ID
   * @returns {string|null} 商户订单ID
   */
  extractOrderId(transactionId) {
    if (!transactionId || !transactionId.startsWith('ABA_')) {
      return null;
    }
    const parts = transactionId.split('_');
    // 移除前缀ABA_和后缀（timestamp_random）
    if (parts.length >= 4) {
      return parts.slice(1, -2).join('_');
    }
    return null;
  }

  /**
   * HTML转义，防止XSS攻击
   *
   * @param {string} text - 原始文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => div[m]);
  }
}

module.exports = ABAGateway;
