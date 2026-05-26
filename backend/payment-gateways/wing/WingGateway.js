/**
 * ============================================================
 * Wing Money 网关实现
 * ============================================================
 * 对接柬埔寨Wing Money支付网关。
 * 支持Wing账户余额支付、Wing卡支付、二维码支付等方式。
 *
 * 支付流程：
 *  1. createPayment → 向Wing API发起支付请求
 *  2. 返回Wing支付页面URL或二维码数据
 *  3. 用户在Wing App中确认支付 → Wing异步回调
 *  4. handleCallback → 验证签名 → 返回标准化结果
 *
 * 安全性：
 *  - 所有API请求使用HMAC-SHA256签名认证
 *  - 回调验证签名防止伪造
 *  - 时间戳防重放攻击
 * ============================================================
 */

const Gateway = require('../base/Gateway');
const { createHttpClient } = require('../common/http');
const { getConfig, validateConfig, STATUS_CODES, PAYMENT_METHODS } = require('./config');
const {
  createPaymentSignature,
  createSortedSignature,
  verifyCallbackSignature,
  createQuerySignature,
  createRefundSignature,
  generateWingTransactionId,
  buildPaymentRequest,
} = require('./crypto');
const {
  SignatureError,
  AmountMismatchError,
  PaymentStatusError,
  NetworkError,
  RefundError,
  ValidationError,
  PaymentTimeoutError,
} = require('../common/error');

class WingGateway extends Gateway {
  /**
   * 创建Wing Money网关实例
   *
   * @param {object} overrides - 覆盖默认配置的配置项
   */
  constructor(overrides = {}) {
    const config = getConfig(overrides);
    super('WING_MONEY', config);
    validateConfig(config);

    // 创建专用HTTP客户端
    this.httpClient = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: this.config.httpConfig.timeout || 30000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Merchant-Id': this.config.merchantId,
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
   * 向Wing API发起支付，获取支付页面URL
   *
   * @param {object} params - 支付参数
   * @param {string} params.orderId - 商户订单ID（必填）
   * @param {number} params.amount - 支付金额（必填）
   * @param {string} params.currency - 货币代码，默认USD
   * @param {string} params.description - 商品描述（必填）
   * @param {string} params.returnUrl - 支付成功回调URL（必填）
   * @param {string} params.cancelUrl - 支付取消回调URL（可选）
   * @param {string} params.paymentMethod - 支付方式（可选）
   * @param {object} params.customerInfo - 客户信息（可选）
   *   @param {string} params.customerInfo.name - 客户姓名
   *   @param {string} params.customerInfo.email - 客户邮箱
   *   @param {string} params.customerInfo.phone - 客户手机号
   * @returns {Promise<object>} 支付结果，包含 paymentUrl、transactionId 等
   */
  async createPayment(params) {
    // 1. 验证参数
    this.validateCreatePaymentParams(params);

    // 2. 生成Wing交易ID
    const transactionId = generateWingTransactionId(params.orderId);

    // 3. 构建请求参数和签名
    const requestData = buildPaymentRequest(
      {
        merchantId: this.config.merchantId,
        orderId: params.orderId,
        amount: params.amount,
        currency: params.currency || this.config.currency || 'USD',
        description: params.description,
        returnUrl: params.returnUrl || this.config.returnUrl,
        cancelUrl: params.cancelUrl || this.config.cancelUrl || params.returnUrl || this.config.returnUrl,
        paymentMethod: params.paymentMethod || PAYMENT_METHODS.WING_ACCOUNT,
        customerInfo: params.customerInfo,
      },
      this.config.apiKey
    );

    // 4. 附加交易ID（Wing使用商户order_id作为交易标识）
    requestData.transaction_id = transactionId;

    try {
      this.log('创建支付', {
        orderId: params.orderId,
        transactionId,
        amount: params.amount,
        currency: params.currency || 'USD',
      });

      // 5. 调用Wing支付接口
      const response = await this.httpClient.post('/payments', requestData);
      const result = response.data;

      // 6. 检查响应状态
      if (result.code !== '200' && result.code !== 200 && result.status !== 'SUCCESS') {
        throw new PaymentStatusError(`Wing支付请求被拒绝: ${result.message || result.desc || '未知错误'}`, {
          code: result.code,
          response: result,
        });
      }

      // 7. 返回标准化结果
      return this.normalizePaymentResult({
        paymentUrl: result.payment_url || result.payUrl || result.qr_code_url,
        transactionId,
        orderId: params.orderId,
        amount: params.amount,
        currency: params.currency || 'USD',
        hash: requestData.sign,
        expiresAt: new Date(Date.now() + (this.config.paymentTimeout || 600) * 1000).toISOString(),
        raw: result,
        // Wing特有：可能返回二维码数据
        qrCode: result.qr_code || result.qrCode || null,
        deepLink: result.deep_link || result.deeplink || null,
      });
    } catch (error) {
      if (error instanceof PaymentStatusError || error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(`Wing支付请求失败: ${error.message}`, {
        orderId: params.orderId,
        originalError: error.message,
      });
    }
  }

  /**
   * 查询支付状态
   * 通过Wing API查询交易状态
   *
   * @param {string} transactionId - Wing交易ID
   * @returns {Promise<object>} 支付状态信息
   */
  async queryPayment(transactionId) {
    this.validateTransactionId(transactionId);

    try {
      const timestamp = new Date().toISOString();

      // 构建查询参数
      const queryParams = {
        merchant_id: this.config.merchantId,
        transaction_id: transactionId,
        timestamp: timestamp,
        sign: createQuerySignature(
          {
            merchantId: this.config.merchantId,
            orderId: transactionId,
            timestamp,
          },
          this.config.apiKey
        ),
      };

      this.log('查询支付状态', { transactionId });

      // 调用Wing查询接口
      const response = await this.httpClient.post('/payments/query', queryParams);
      const result = response.data;

      // 解析Wing状态
      const wingStatus = result.status || result.payment_status || result.tran_status;
      let normalizedStatus = 'unknown';

      // Wing状态码映射
      const statusMap = {
        SUCCESS: 'success',
        PENDING: 'pending',
        FAILED: 'failed',
        CANCELLED: 'cancelled',
        EXPIRED: 'expired',
        REFUNDED: 'refunded',
        0: 'success',
        1: 'pending',
        2: 'failed',
        3: 'cancelled',
        4: 'expired',
      };
      normalizedStatus = statusMap[wingStatus] || 'unknown';

      return {
        gateway: this.gatewayName,
        status: normalizedStatus,
        transactionId,
        orderId: result.order_id || null,
        amount: result.amount ? parseFloat(result.amount) : null,
        currency: result.currency || 'USD',
        paidAt: result.paid_at || result.payment_time || null,
        gatewayReference: result.wing_ref || result.reference_no || null,
        message: result.message || result.desc || null,
        raw: result,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(`查询Wing交易状态失败: ${error.message}`, {
        transactionId,
        originalError: error.message,
      });
    }
  }

  /**
   * 处理支付回调
   * 验证回调签名并解析支付结果
   *
   * @param {object} payload - 回调POST数据
   * @param {string} signature - 回调签名（可选，如不在payload中）
   * @returns {Promise<object>} 标准化回调结果
   *
   * Wing回调参数说明：
   *   merchant_id: 商户ID
   *   order_id: 商户订单ID
   *   transaction_id: Wing交易ID
   *   status: 状态（SUCCESS/PENDING/FAILED）
   *   amount: 金额
   *   currency: 货币
   *   paid_at: 支付时间
   *   sign: 签名
   */
  async handleCallback(payload, signature) {
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('Wing回调参数不能为空');
    }

    // Wing回调签名通常在sign字段中
    const callbackSign = signature || payload.sign;
    if (!callbackSign) {
      throw new SignatureError('Wing回调缺少签名（sign字段）');
    }

    const transactionId = payload.transaction_id;
    const orderId = payload.order_id;
    const status = payload.status;
    const amount = payload.amount !== undefined ? parseFloat(payload.amount) : undefined;

    if (!transactionId) {
      throw new ValidationError('Wing回调缺少交易ID（transaction_id字段）');
    }

    if (!status) {
      throw new ValidationError('Wing回调缺少状态（status字段）');
    }

    // 1. 验证签名
    const isValid = this.verifySignature(payload, callbackSign);

    if (!isValid) {
      this.log('回调签名验证失败', {
        transactionId,
        orderId,
        receivedSign: callbackSign,
      });
      throw new SignatureError('Wing回调签名验证失败', {
        transactionId,
        receivedSign: callbackSign,
      });
    }

    // 2. 解析状态
    const statusMap = {
      SUCCESS: 'success',
      PENDING: 'pending',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
      EXPIRED: 'expired',
      REFUNDED: 'refunded',
    };
    const normalizedStatus = statusMap[status] || 'unknown';

    // 3. 记录日志
    this.log('处理回调', {
      transactionId,
      orderId,
      status,
      normalizedStatus,
      amount,
    });

    // 4. 返回标准化结果
    return this.normalizeCallbackResult({
      status: normalizedStatus,
      transactionId,
      orderId,
      amount,
      currency: payload.currency || 'USD',
      paidAt: payload.paid_at || (normalizedStatus === 'success' ? new Date().toISOString() : null),
      gatewayReference: payload.wing_ref || payload.reference_no || null,
      message: payload.message || null,
      verified: true,
      raw: payload,
    });
  }

  /**
   * 申请退款
   * 通过Wing API发起退款请求
   *
   * @param {string} transactionId - 原Wing交易ID
   * @param {number} amount - 退款金额
   * @param {string} reason - 退款原因
   * @returns {Promise<object>} 退款结果
   */
  async refund(transactionId, amount, reason) {
    this.validateRefundParams(transactionId, amount, reason);

    try {
      const refundId = `REF_${transactionId}_${Date.now()}`;
      const timestamp = new Date().toISOString();

      // 构建退款请求
      const refundRequest = {
        merchant_id: this.config.merchantId,
        transaction_id: transactionId,
        refund_id: refundId,
        amount: Number(amount).toFixed(2),
        reason: reason,
        timestamp: timestamp,
        sign: createRefundSignature(
          {
            merchantId: this.config.merchantId,
            originalOrderId: transactionId,
            refundAmount: amount,
            refundId,
            timestamp,
          },
          this.config.apiKey
        ),
      };

      this.log('申请退款', {
        transactionId,
        refundId,
        amount,
        reason,
      });

      // 调用Wing退款接口
      const response = await this.httpClient.post('/payments/refund', refundRequest);
      const result = response.data;

      // 解析退款状态
      let refundStatus = 'pending';
      if (result.status === 'SUCCESS' || result.refund_status === 'SUCCESS' || result.code === '200') {
        refundStatus = 'success';
      } else if (result.status === 'FAILED' || result.refund_status === 'FAILED') {
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
      throw new RefundError(`Wing退款请求失败: ${error.message}`, {
        transactionId,
        amount,
        originalError: error.message,
      });
    }
  }

  /**
   * 验证签名
   * 支持Wing回调签名和排序参数签名验证
   *
   * @param {object} payload - 回调参数对象
   * @param {string} signature - 待验证的签名
   * @returns {boolean} 签名是否有效
   */
  verifySignature(payload, signature) {
    if (!payload || !signature) {
      return false;
    }

    // 使用Wing排序参数方式验证
    return verifyCallbackSignature(payload, this.config.apiKey, 'sign');
  }

  /**
   * 生成Wing支付页面HTML表单
   * 用于直接跳转到Wing支付页面
   *
   * @param {object} paymentResult - createPayment返回的结果
   * @returns {string} HTML表单
   */
  generatePaymentRedirectHtml(paymentResult) {
    if (!paymentResult || !paymentResult.paymentUrl) {
      throw new ValidationError('支付结果或支付URL不能为空');
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>正在跳转到Wing支付...</title>
</head>
<body>
  <p>正在跳转到Wing Money支付页面，请稍候...</p>
  <script>window.location.href = "${paymentResult.paymentUrl}";</script>
</body>
</html>`;
  }

  /**
   * 生成Wing二维码支付HTML页面
   * 展示二维码供用户扫描支付
   *
   * @param {object} paymentResult - createPayment返回的结果
   * @returns {string} HTML页面
   */
  generateQrCodePaymentHtml(paymentResult) {
    if (!paymentResult || !paymentResult.qrCode) {
      throw new ValidationError('二维码数据不能为空，请先使用QR_CODE支付方式创建支付');
    }

    const qrCodeData = paymentResult.qrCode;
    const escapedQr = this.escapeHtml(qrCodeData);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wing二维码支付</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
    .qr-container { margin: 20px auto; max-width: 300px; }
    .qr-code { width: 250px; height: 250px; }
    .amount { font-size: 24px; font-weight: bold; color: #333; margin: 10px 0; }
    .hint { color: #666; margin-top: 15px; }
  </style>
</head>
<body>
  <h2>请使用Wing App扫描二维码</h2>
  <div class="qr-container">
    <img class="qr-code" src="${escapedQr}" alt="Wing支付二维码" />
  </div>
  <div class="amount">$${paymentResult.amount} ${paymentResult.currency}</div>
  <div class="hint">
    <p>打开Wing App → 点击"扫一扫"</p>
    <p>扫描上方二维码完成支付</p>
  </div>
</body>
</html>`;
  }

  /**
   * HTML转义
   */
  escapeHtml(text) {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => div[m]);
  }
}

module.exports = WingGateway;
