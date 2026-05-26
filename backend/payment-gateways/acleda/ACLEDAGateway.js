/**
 * ============================================================
 * ACLEDA Bank PayGo 网关实现
 * ============================================================
 * 对接柬埔寨ACLEDA Bank的PayGo支付网关。
 * 支持ACLEDA账户支付、信用卡/借记卡支付、KHQR二维码支付。
 *
 * 支付流程：
 *  1. createPayment → 向ACLEDA PayGo API发起支付请求
 *  2. 返回PayGo支付页面URL或KHQR码
 *  3. 用户在ACLEDA渠道完成支付 → 回调到returnUrl
 *  4. handleCallback → 验证签名 → 返回标准化结果
 *
 * 安全性：
 *  - 请求使用HMAC-SHA256签名
 *  - 回调验证签名防止伪造
 *  - 参数按ASCII排序后签名
 * ============================================================
 */

const Gateway = require('../base/Gateway');
const { createHttpClient } = require('../common/http');
const { getConfig, validateConfig, STATUS_CODES, PAYMENT_METHODS } = require('./config');
const {
  createPaymentSignature,
  createConcatenatedSignature,
  verifyCallbackSignature,
  createQuerySignature,
  createRefundSignature,
  generateACLEDATransactionId,
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

class ACLEDAGateway extends Gateway {
  /**
   * 创建ACLEDA PayGo网关实例
   *
   * @param {object} overrides - 覆盖默认配置的配置项
   */
  constructor(overrides = {}) {
    const config = getConfig(overrides);
    super('ACLEDA_PAYGO', config);
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
   * 向ACLEDA PayGo API发起支付请求
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
   * @param {number} params.expiryMinutes - 支付有效期（分钟，可选）
   * @returns {Promise<object>} 支付结果，包含 paymentUrl、transactionId 等
   */
  async createPayment(params) {
    // 1. 验证参数
    this.validateCreatePaymentParams(params);

    // 2. 生成ACLEDA交易ID
    const transactionId = generateACLEDATransactionId(params.orderId);

    // 3. 构建请求参数和签名
    const requestData = buildPaymentRequest(
      {
        merchantId: this.config.merchantId,
        merchantName: this.config.merchantName,
        orderId: params.orderId,
        amount: params.amount,
        currency: params.currency || this.config.currency || 'USD',
        description: params.description,
        returnUrl: params.returnUrl || this.config.returnUrl,
        cancelUrl: params.cancelUrl || this.config.cancelUrl || params.returnUrl || this.config.returnUrl,
        paymentMethod: params.paymentMethod || PAYMENT_METHODS.CREDIT_CARD,
        customerInfo: params.customerInfo,
        expiryMinutes: params.expiryMinutes || this.config.paymentTimeout / 60,
      },
      this.config.apiKey
    );

    // 4. 附加交易ID
    requestData.transaction_id = transactionId;

    try {
      this.log('创建支付', {
        orderId: params.orderId,
        transactionId,
        amount: params.amount,
        currency: params.currency || 'USD',
        merchantName: this.config.merchantName,
      });

      // 5. 调用ACLEDA支付接口
      const response = await this.httpClient.post('/payments/create', requestData);
      const result = response.data;

      // 6. 检查响应状态
      if (result.code && result.code !== '000' && result.code !== '0000' && result.code !== 200) {
        throw new PaymentStatusError(`ACLEDA支付请求被拒绝: ${result.message || result.desc || result.error || '未知错误'}`, {
          code: result.code,
          response: result,
        });
      }

      // 7. 返回标准化结果
      return this.normalizePaymentResult({
        paymentUrl: result.payment_url || result.pay_url || result.checkout_url,
        transactionId,
        orderId: params.orderId,
        amount: params.amount,
        currency: params.currency || 'USD',
        hash: requestData.sign,
        expiresAt: new Date(Date.now() + (this.config.paymentTimeout || 900) * 1000).toISOString(),
        raw: result,
        // ACLEDA特有：可能返回KHQR数据
        khqrString: result.khqr_string || result.qr_data || null,
        deeplink: result.deeplink || result.app_link || null,
      });
    } catch (error) {
      if (error instanceof PaymentStatusError || error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(`ACLEDA支付请求失败: ${error.message}`, {
        orderId: params.orderId,
        originalError: error.message,
      });
    }
  }

  /**
   * 查询支付状态
   * 通过ACLEDA PayGo API查询交易状态
   *
   * @param {string} transactionId - ACLEDA交易ID
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

      // 调用ACLEDA查询接口
      const response = await this.httpClient.post('/payments/query', queryParams);
      const result = response.data;

      // 解析ACLEDA状态码
      const statusCode = result.status !== undefined ? result.status : result.payment_status;
      const normalizedStatus = STATUS_CODES[statusCode] || 'unknown';

      return {
        gateway: this.gatewayName,
        status: normalizedStatus,
        transactionId,
        orderId: result.order_id || null,
        amount: result.amount ? parseFloat(result.amount) : null,
        currency: result.currency || 'USD',
        paidAt: result.paid_at || result.payment_datetime || result.transaction_date || null,
        gatewayReference: result.reference_no || result.acleda_ref || result.trace_no || null,
        message: result.message || result.description || null,
        raw: result,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(`查询ACLEDA交易状态失败: ${error.message}`, {
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
   * ACLEDA回调参数说明：
   *   merchant_id: 商户ID
   *   order_id: 商户订单ID
   *   transaction_id: ACLEDA交易ID
   *   status: 状态码（0=成功，1=待处理，2=失败，3=取消，4=过期）
   *   amount: 金额
   *   currency: 货币
   *   paid_at: 支付时间
   *   reference_no: 参考号
   *   sign: 签名
   */
  async handleCallback(payload, signature) {
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('ACLEDA回调参数不能为空');
    }

    // ACLEDA回调签名通常在sign字段中
    const callbackSign = signature || payload.sign;
    if (!callbackSign) {
      throw new SignatureError('ACLEDA回调缺少签名（sign字段）');
    }

    const transactionId = payload.transaction_id;
    const orderId = payload.order_id;
    const statusCode = payload.status !== undefined ? parseInt(payload.status, 10) : undefined;
    const amount = payload.amount !== undefined ? parseFloat(payload.amount) : undefined;

    if (!transactionId) {
      throw new ValidationError('ACLEDA回调缺少交易ID（transaction_id字段）');
    }

    if (statusCode === undefined) {
      throw new ValidationError('ACLEDA回调缺少状态码（status字段）');
    }

    // 1. 验证签名
    const isValid = this.verifySignature(payload, callbackSign);

    if (!isValid) {
      this.log('回调签名验证失败', {
        transactionId,
        orderId,
        receivedSign: callbackSign,
      });
      throw new SignatureError('ACLEDA回调签名验证失败', {
        transactionId,
        receivedSign: callbackSign,
      });
    }

    // 2. 解析状态码
    const normalizedStatus = STATUS_CODES[statusCode] || 'unknown';

    // 3. 记录日志
    this.log('处理回调', {
      transactionId,
      orderId,
      statusCode,
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
      gatewayReference: payload.reference_no || payload.trace_no || null,
      message: payload.message || null,
      verified: true,
      raw: payload,
    });
  }

  /**
   * 申请退款
   * 通过ACLEDA PayGo API发起退款请求
   *
   * @param {string} transactionId - 原ACLEDA交易ID
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
      };

      // 计算退款签名
      refundRequest.sign = createRefundSignature(
        {
          merchantId: this.config.merchantId,
          originalOrderId: transactionId,
          refundAmount: amount,
          refundId,
          timestamp,
        },
        this.config.apiKey
      );

      this.log('申请退款', {
        transactionId,
        refundId,
        amount,
        reason,
      });

      // 调用ACLEDA退款接口
      const response = await this.httpClient.post('/payments/refund', refundRequest);
      const result = response.data;

      // 解析退款状态
      let refundStatus = 'pending';
      const refundStatusCode = result.refund_status !== undefined ? result.refund_status : result.status;
      if (refundStatusCode === 0 || refundStatusCode === '000' || refundStatusCode === 'SUCCESS') {
        refundStatus = 'success';
      } else if (refundStatusCode === 2 || refundStatusCode === 'FAILED') {
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
      throw new RefundError(`ACLEDA退款请求失败: ${error.message}`, {
        transactionId,
        amount,
        originalError: error.message,
      });
    }
  }

  /**
   * 验证签名
   * 支持ACLEDA回调签名验证（参数排序方式）
   *
   * @param {object} payload - 回调参数对象
   * @param {string} signature - 待验证的签名
   * @returns {boolean} 签名是否有效
   */
  verifySignature(payload, signature) {
    if (!payload || !signature) {
      return false;
    }

    // 使用ACLEDA参数排序方式验证
    return verifyCallbackSignature(payload, this.config.apiKey, 'sign');
  }

  /**
   * 生成KHQR支付HTML页面
   * ACLEDA支持柬埔寨国家二维码标准（Bakong KHQR），用ACLEDA App扫描
   *
   * @param {object} paymentResult - createPayment返回的结果
   * @returns {string} HTML页面
   */
  generateKhqrPaymentHtml(paymentResult) {
    if (!paymentResult || !paymentResult.khqrString) {
      throw new ValidationError('KHQR数据不能为空，请先使用KHQR支付方式创建支付');
    }

    const khqrData = paymentResult.khqrString;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ACLEDA KHQR 支付</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f5f5f5; }
    .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .logo { font-size: 20px; font-weight: bold; color: #0056b3; margin-bottom: 20px; }
    .qr-container { margin: 20px 0; padding: 15px; background: white; border: 2px solid #e0e0e0; border-radius: 8px; }
    .amount { font-size: 28px; font-weight: bold; color: #333; margin: 15px 0; }
    .currency { font-size: 16px; color: #666; }
    .merchant { font-size: 14px; color: #888; margin-top: 10px; }
    .hint { color: #555; margin-top: 20px; font-size: 14px; line-height: 1.6; }
    .hint strong { color: #0056b3; }
    .badge { display: inline-block; background: #0056b3; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ACLEDA Bank PayGo</div>
    <div class="badge">KHQR Standard</div>
    <div class="amount">$${paymentResult.amount}</div>
    <div class="currency">${paymentResult.currency}</div>
    <div class="qr-container">
      <canvas id="khqr-canvas" width="250" height="250"></canvas>
    </div>
    <div class="merchant">${this.config.merchantName}</div>
    <div class="hint">
      <p><strong>支付步骤：</strong></p>
      <p>1. 打开 ACLEDA App 或 Bakong App</p>
      <p>2. 点击"扫描 KHQR"</p>
      <p>3. 扫描上方二维码完成支付</p>
    </div>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script>
    new QRCode(document.getElementById('khqr-canvas'), {
      text: '${khqrData.replace(/'/g, "\\'")}',
      width: 250,
      height: 250,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  </script>
</body>
</html>`;
  }

  /**
   * 生成ACLEDA支付页面跳转HTML
   *
   * @param {object} paymentResult - createPayment返回的结果
   * @returns {string} HTML页面
   */
  generatePaymentRedirectHtml(paymentResult) {
    if (!paymentResult || !paymentResult.paymentUrl) {
      throw new ValidationError('支付结果或支付URL不能为空');
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>正在跳转到ACLEDA PayGo...</title>
</head>
<body>
  <p>正在跳转到ACLEDA Bank PayGo支付页面，请稍候...</p>
  <script>window.location.href = "${paymentResult.paymentUrl}";</script>
</body>
</html>`;
  }

  /**
   * 从交易ID中提取商户订单ID
   * ACLEDA交易ID格式：ACLD_{orderId}_{timestamp}_{random}
   *
   * @param {string} transactionId - ACLEDA交易ID
   * @returns {string|null} 商户订单ID
   */
  extractOrderId(transactionId) {
    if (!transactionId || !transactionId.startsWith('ACLD_')) {
      return null;
    }
    const parts = transactionId.split('_');
    if (parts.length >= 4) {
      return parts.slice(1, -2).join('_');
    }
    return null;
  }
}

module.exports = ACLEDAGateway;
