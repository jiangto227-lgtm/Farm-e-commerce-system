/**
 * ============================================================
 * 支付异常定义模块
 * ============================================================
 * 定义柬埔寨支付网关SDK中使用的各类异常类型，
 * 包括支付失败、签名验证失败、网络请求异常等。
 * 所有异常均继承自 PaymentError 基类，便于统一捕获和处理。
 * ============================================================
 */

/**
 * 支付异常基类
 * 所有支付相关异常的父类
 */
class PaymentError extends Error {
  /**
   * @param {string} message - 异常描述信息
   * @param {string} code - 错误码，用于程序识别
   * @param {number} httpStatus - HTTP状态码，默认500
   * @param {object} extra - 额外信息（如原始响应、请求参数等）
   */
  constructor(message, code = 'PAYMENT_ERROR', httpStatus = 500, extra = {}) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.extra = extra;
    this.timestamp = new Date().toISOString();

    // 保持正确的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PaymentError);
    }
  }

  /**
   * 将异常转换为JSON格式，便于日志记录和API响应
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      httpStatus: this.httpStatus,
      timestamp: this.timestamp,
      extra: this.extra,
    };
  }
}

/**
 * 签名验证失败异常
 * 当回调签名验证不通过或请求签名计算错误时抛出
 */
class SignatureError extends PaymentError {
  constructor(message = '签名验证失败', extra = {}) {
    super(message, 'SIGNATURE_ERROR', 403, extra);
    this.name = 'SignatureError';
  }
}

/**
 * 网络请求异常
 * 当与支付网关通信失败时抛出（超时、DNS错误、连接中断等）
 */
class NetworkError extends PaymentError {
  constructor(message = '网络请求失败', extra = {}) {
    super(message, 'NETWORK_ERROR', 503, extra);
    this.name = 'NetworkError';
  }
}

/**
 * 支付状态异常
 * 当支付状态不符合预期时抛出（如重复支付、已过期等）
 */
class PaymentStatusError extends PaymentError {
  constructor(message = '支付状态异常', extra = {}) {
    super(message, 'STATUS_ERROR', 400, extra);
    this.name = 'PaymentStatusError';
  }
}

/**
 * 支付金额不匹配异常
 * 当回调金额与订单金额不一致时抛出（防止篡改金额）
 */
class AmountMismatchError extends PaymentError {
  constructor(message = '支付金额不匹配', extra = {}) {
    super(message, 'AMOUNT_MISMATCH', 400, extra);
    this.name = 'AmountMismatchError';
  }
}

/**
 * 支付超时异常
 * 当用户未在规定时间内完成支付时抛出
 */
class PaymentTimeoutError extends PaymentError {
  constructor(message = '支付已超时', extra = {}) {
    super(message, 'TIMEOUT_ERROR', 408, extra);
    this.name = 'PaymentTimeoutError';
  }
}

/**
 * 配置异常
 * 当SDK配置不正确时抛出（缺少必要参数、格式错误等）
 */
class ConfigurationError extends PaymentError {
  constructor(message = '配置错误', extra = {}) {
    super(message, 'CONFIG_ERROR', 500, extra);
    this.name = 'ConfigurationError';
  }
}

/**
 * 网关拒绝异常
 * 当支付网关明确拒绝请求时抛出（余额不足、卡被冻结等）
 */
class GatewayDeclinedError extends PaymentError {
  constructor(message = '支付请求被网关拒绝', extra = {}) {
    super(message, 'GATEWAY_DECLINED', 422, extra);
    this.name = 'GatewayDeclinedError';
  }
}

/**
 * 幂等性冲突异常
 * 当同一交易ID被重复处理时抛出
 */
class IdempotencyError extends PaymentError {
  constructor(message = '该交易已被处理，请勿重复提交', extra = {}) {
    super(message, 'IDEMPOTENCY_ERROR', 409, extra);
    this.name = 'IdempotencyError';
  }
}

/**
 * 退款异常
 * 当退款操作失败时抛出
 */
class RefundError extends PaymentError {
  constructor(message = '退款操作失败', extra = {}) {
    super(message, 'REFUND_ERROR', 400, extra);
    this.name = 'RefundError';
  }
}

/**
 * 参数验证异常
 * 当传入参数不符合要求时抛出
 */
class ValidationError extends PaymentError {
  constructor(message = '参数验证失败', extra = {}) {
    super(message, 'VALIDATION_ERROR', 400, extra);
    this.name = 'ValidationError';
  }
}

module.exports = {
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
};
