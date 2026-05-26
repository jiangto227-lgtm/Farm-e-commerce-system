/**
 * ============================================================
 * 支付网关抽象基类
 * ============================================================
 * 定义柬埔寨所有支付网关的通用接口，
 * 具体网关（ABA、Wing、ACLEDA）需继承此类并实现所有抽象方法。
 * 基类提供参数验证、日志记录等通用功能。
 * ============================================================
 */

const { ValidationError, ConfigurationError } = require('../common/error');

class Gateway {
  /**
   * @param {string} gatewayName - 网关名称标识
   * @param {object} config - 网关配置对象
   */
  constructor(gatewayName, config = {}) {
    if (new.target === Gateway) {
      throw new Error('Gateway是抽象类，不能直接实例化，请使用具体网关实现');
    }

    this.gatewayName = gatewayName;
    this.config = config;

    // 验证配置
    this.validateConfig(config);
  }

  /**
   * 验证网关配置是否完整
   * 子类应重写此方法以添加特定验证逻辑
   *
   * @param {object} config - 配置对象
   * @throws {ConfigurationError} 配置不完整时抛出
   */
  validateConfig(config) {
    if (!config.merchantId) {
      throw new ConfigurationError(`${this.gatewayName} 商户ID（merchantId）不能为空`);
    }
    if (!config.apiKey) {
      throw new ConfigurationError(`${this.gatewayName} API密钥（apiKey）不能为空`);
    }
    if (!config.apiUrl) {
      throw new ConfigurationError(`${this.gatewayName} API地址（apiUrl）不能为空`);
    }
  }

  /**
   * 创建支付请求
   * 抽象方法，子类必须实现
   *
   * @param {object} params - 支付参数
   * @param {string} params.orderId - 商户订单ID
   * @param {number} params.amount - 支付金额
   * @param {string} params.currency - 货币代码（默认USD）
   * @param {string} params.description - 商品描述
   * @param {string} params.returnUrl - 支付成功回调URL
   * @param {string} params.cancelUrl - 支付取消回调URL
   * @param {object} params.extra - 网关特定额外参数
   * @returns {Promise<object>} 支付请求结果，包含 paymentUrl、transactionId 等
   */
  async createPayment(params) {
    throw new Error(`${this.gatewayName} 未实现 createPayment 方法`);
  }

  /**
   * 查询支付状态
   * 抽象方法，子类必须实现
   *
   * @param {string} transactionId - 网关交易ID
   * @returns {Promise<object>} 支付状态信息
   */
  async queryPayment(transactionId) {
    throw new Error(`${this.gatewayName} 未实现 queryPayment 方法`);
  }

  /**
   * 处理支付回调通知
   * 抽象方法，子类必须实现
   *
   * @param {object|string} payload - 回调数据（可能是JSON对象或查询字符串）
   * @param {string} signature - 回调签名
   * @returns {Promise<object>} 标准化回调结果
   */
  async handleCallback(payload, signature) {
    throw new Error(`${this.gatewayName} 未实现 handleCallback 方法`);
  }

  /**
   * 申请退款
   * 抽象方法，子类必须实现
   *
   * @param {string} transactionId - 原交易ID
   * @param {number} amount - 退款金额
   * @param {string} reason - 退款原因
   * @returns {Promise<object>} 退款结果
   */
  async refund(transactionId, amount, reason) {
    throw new Error(`${this.gatewayName} 未实现 refund 方法`);
  }

  /**
   * 验证签名
   * 抽象方法，子类必须实现
   *
   * @param {object|string} payload - 待验证的数据
   * @param {string} signature - 待验证的签名
   * @returns {boolean} 签名是否有效
   */
  verifySignature(payload, signature) {
    throw new Error(`${this.gatewayName} 未实现 verifySignature 方法`);
  }

  // ============ 以下是通用辅助方法，子类可直接使用 ============

  /**
   * 验证创建支付的必填参数
   *
   * @param {object} params - 支付参数
   * @throws {ValidationError} 参数不合法时抛出
   */
  validateCreatePaymentParams(params) {
    if (!params.orderId || typeof params.orderId !== 'string') {
      throw new ValidationError('订单ID（orderId）不能为空且必须为字符串');
    }
    if (params.orderId.length > 100) {
      throw new ValidationError('订单ID长度不能超过100个字符');
    }

    if (params.amount === undefined || params.amount === null) {
      throw new ValidationError('支付金额（amount）不能为空');
    }
    if (typeof params.amount !== 'number' || params.amount <= 0) {
      throw new ValidationError('支付金额（amount）必须为正数');
    }
    // 金额保留两位小数（柬埔寨瑞尔和美元均支持2位小数）
    const roundedAmount = Math.round(params.amount * 100) / 100;
    if (roundedAmount !== params.amount) {
      throw new ValidationError('支付金额最多支持两位小数');
    }

    const supportedCurrencies = ['USD', 'KHR', 'THB'];
    if (params.currency && !supportedCurrencies.includes(params.currency.toUpperCase())) {
      throw new ValidationError(`不支持的货币类型: ${params.currency}，支持的货币: ${supportedCurrencies.join(', ')}`);
    }

    if (!params.description || params.description.trim().length === 0) {
      throw new ValidationError('商品描述（description）不能为空');
    }
    if (params.description.length > 255) {
      throw new ValidationError('商品描述长度不能超过255个字符');
    }

    if (!params.returnUrl) {
      throw new ValidationError('支付成功回调地址（returnUrl）不能为空');
    }
    try {
      new URL(params.returnUrl);
    } catch {
      throw new ValidationError('支付成功回调地址（returnUrl）格式不正确');
    }

    if (params.cancelUrl) {
      try {
        new URL(params.cancelUrl);
      } catch {
        throw new ValidationError('支付取消回调地址（cancelUrl）格式不正确');
      }
    }
  }

  /**
   * 验证交易ID
   *
   * @param {string} transactionId - 交易ID
   * @throws {ValidationError} 交易ID不合法时抛出
   */
  validateTransactionId(transactionId) {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new ValidationError('交易ID（transactionId）不能为空且必须为字符串');
    }
    if (transactionId.length > 200) {
      throw new ValidationError('交易ID长度不能超过200个字符');
    }
  }

  /**
   * 验证退款参数
   *
   * @param {string} transactionId - 交易ID
   * @param {number} amount - 退款金额
   * @param {string} reason - 退款原因
   * @throws {ValidationError} 参数不合法时抛出
   */
  validateRefundParams(transactionId, amount, reason) {
    this.validateTransactionId(transactionId);

    if (amount === undefined || amount === null) {
      throw new ValidationError('退款金额（amount）不能为空');
    }
    if (typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('退款金额（amount）必须为正数');
    }
    if (Math.round(amount * 100) / 100 !== amount) {
      throw new ValidationError('退款金额最多支持两位小数');
    }

    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('退款原因（reason）不能为空');
    }
    if (reason.length > 500) {
      throw new ValidationError('退款原因长度不能超过500个字符');
    }
  }

  /**
   * 记录脱敏后的支付日志
   *
   * @param {string} action - 操作名称
   * @param {object} data - 日志数据（会自动脱敏）
   * @param {string} level - 日志级别：log | warn | error
   */
  log(action, data = {}, level = 'log') {
    const { sanitizeSensitiveData } = require('../common/http');
    const logEntry = {
      gateway: this.gatewayName,
      action,
      data: sanitizeSensitiveData(data),
      timestamp: new Date().toISOString(),
    };
    console[level](`[${this.gatewayName}] ${action}: ${JSON.stringify(logEntry)}`);
  }

  /**
   * 生成标准化的支付结果对象
   * 所有网关应使用此格式返回支付结果，便于上层统一处理
   *
   * @param {object} result - 原始结果
   * @returns {object} 标准化结果
   */
  normalizePaymentResult(result) {
    return {
      gateway: this.gatewayName,
      paymentUrl: result.paymentUrl || null,
      transactionId: result.transactionId || null,
      orderId: result.orderId || null,
      amount: result.amount || null,
      currency: result.currency || 'USD',
      hash: result.hash || null,
      signature: result.signature || null,
      expiresAt: result.expiresAt || null,
      raw: result.raw || null,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 生成标准化的回调结果对象
   * 所有网关应使用此格式返回回调处理结果
   *
   * @param {object} result - 原始回调结果
   * @returns {object} 标准化结果
   */
  normalizeCallbackResult(result) {
    return {
      gateway: this.gatewayName,
      status: result.status || 'unknown', // 'success' | 'failed' | 'pending'
      transactionId: result.transactionId || null,
      orderId: result.orderId || null,
      amount: result.amount || null,
      currency: result.currency || 'USD',
      paidAt: result.paidAt || null,
      gatewayReference: result.gatewayReference || null, // 网关侧参考号
      message: result.message || null,
      verified: result.verified || false, // 签名是否验证通过
      raw: result.raw || null,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成标准化的退款结果对象
   *
   * @param {object} result - 原始退款结果
   * @returns {object} 标准化结果
   */
  normalizeRefundResult(result) {
    return {
      gateway: this.gatewayName,
      status: result.status || 'unknown', // 'success' | 'failed' | 'pending'
      refundTransactionId: result.refundTransactionId || null,
      originalTransactionId: result.originalTransactionId || null,
      amount: result.amount || null,
      currency: result.currency || 'USD',
      reason: result.reason || null,
      refundedAt: result.refundedAt || null,
      raw: result.raw || null,
      processedAt: new Date().toISOString(),
    };
  }
}

module.exports = Gateway;
