/**
 * ============================================================
 * 统一回调处理模块
 * ============================================================
 * 处理柬埔寨三大支付网关（ABA、Wing、ACLEDA）的统一回调，
 * 根据支付方式自动路由到对应网关处理，标准化回调结果。
 *
 * 核心功能：
 *  1. 回调路由 - 根据参数自动识别支付网关
 *  2. 签名验证 - 验证回调数据的合法性
 *  3. 幂等性控制 - 防止同一交易重复处理
 *  4. 金额校验 - 确保回调金额与订单金额一致
 *  5. 超时处理 - 检测支付超时并自动取消订单
 *  6. 日志记录 - 完整记录回调处理流程（脱敏）
 *
 * 使用方式：
 *   const handler = new PaymentCallbackHandler({ abaGateway, wingGateway, acledaGateway });
 *   const result = await handler.handle(gatewayType, payload, signature);
 * ============================================================
 */

const {
  PaymentError,
  SignatureError,
  AmountMismatchError,
  PaymentStatusError,
  ValidationError,
  IdempotencyError,
  PaymentTimeoutError,
} = require('../common/error');
const { sanitizeSensitiveData } = require('../common/http');

/**
 * 已处理交易的内存缓存（生产环境建议替换为Redis）
 * 用于幂等性控制，防止同一回调被重复处理
 */
const processedTransactions = new Map();

/**
 * 回调处理结果状态枚举
 */
const CALLBACK_RESULT = {
  SUCCESS: 'success',       // 处理成功
  FAILED: 'failed',         // 处理失败
  PENDING: 'pending',       // 待处理
  REPEATED: 'repeated',     // 重复回调（幂等）
  EXPIRED: 'expired',       // 支付已过期
  INVALID_SIGN: 'invalid_sign', // 签名无效
};

class PaymentCallbackHandler {
  /**
   * 创建回调处理器
   *
   * @param {object} gateways - 网关实例对象
   * @param {ABAGateway} gateways.abaGateway - ABA网关实例
   * @param {WingGateway} gateways.wingGateway - Wing网关实例
   * @param {ACLEDAGateway} gateways.acledaGateway - ACLEDA网关实例
   * @param {object} options - 额外选项
   * @param {function} options.onPaymentSuccess - 支付成功回调函数
   * @param {function} options.onPaymentFailed - 支付失败回调函数
   * @param {function} options.onPaymentExpired - 支付过期回调函数
   * @param {function} options.notifyService - 通知服务（短信/推送）
   * @param {object} options.idempotencyStore - 幂等性存储（需实现get/set，默认内存Map）
   */
  constructor(gateways = {}, options = {}) {
    this.gateways = {
      ABA_PAYWAY: gateways.abaGateway || null,
      WING_MONEY: gateways.wingGateway || null,
      ACLEDA_PAYGO: gateways.acledaGateway || null,
    };

    this.options = {
      // 默认超时时间（毫秒）
      defaultTimeout: options.defaultTimeout || 15 * 60 * 1000, // 15分钟
      // 是否启用幂等性检查
      enableIdempotency: options.enableIdempotency !== false,
      // 幂等性存储
      idempotencyStore: options.idempotencyStore || null,
      // 回调函数
      onPaymentSuccess: options.onPaymentSuccess || null,
      onPaymentFailed: options.onPaymentFailed || null,
      onPaymentExpired: options.onPaymentExpired || null,
      // 通知服务
      notifyService: options.notifyService || null,
    };
  }

  /**
   * 处理支付回调（主入口）
   *
   * @param {string} gatewayType - 网关类型：'ABA_PAYWAY' | 'WING_MONEY' | 'ACLEDA_PAYGO'
   * @param {object} payload - 回调数据（解析后的对象）
   * @param {string} signature - 回调签名（如不在payload中）
   * @param {object} context - 上下文信息（如订单原始金额用于校验）
   * @returns {Promise<object>} 统一格式的回调处理结果
   */
  async handle(gatewayType, payload, signature, context = {}) {
    const startTime = Date.now();

    try {
      // 1. 参数校验
      if (!gatewayType) {
        throw new ValidationError('网关类型（gatewayType）不能为空');
      }
      if (!payload || typeof payload !== 'object') {
        throw new ValidationError('回调数据（payload）不能为空');
      }

      // 2. 获取对应网关
      const gateway = this.gateways[gatewayType];
      if (!gateway) {
        throw new ValidationError(`未找到对应的网关实现: ${gatewayType}`);
      }

      // 3. 提取交易ID（用于幂等性检查）
      const transactionId = this.extractTransactionId(gatewayType, payload);

      // 4. 幂等性检查
      if (this.options.enableIdempotency && transactionId) {
        const isProcessed = await this.isTransactionProcessed(transactionId);
        if (isProcessed) {
          this.log('幂等性拦截', { gatewayType, transactionId, reason: '该交易已被处理' });
          return {
            result: CALLBACK_RESULT.REPEATED,
            gateway: gatewayType,
            transactionId,
            message: '该回调已被处理，跳过重复处理',
            processedAt: new Date().toISOString(),
          };
        }
      }

      // 5. 调用对应网关处理回调
      this.log('开始处理回调', { gatewayType, transactionId });
      const callbackResult = await gateway.handleCallback(payload, signature);

      // 6. 金额校验（如果提供了原始订单金额）
      if (context.expectedAmount !== undefined && callbackResult.amount !== undefined) {
        const expectedAmount = Math.round(parseFloat(context.expectedAmount) * 100) / 100;
        const actualAmount = Math.round(parseFloat(callbackResult.amount) * 100) / 100;

        if (expectedAmount !== actualAmount) {
          this.log('金额校验失败', {
            gatewayType,
            transactionId,
            expectedAmount,
            actualAmount,
          });
          throw new AmountMismatchError(
            `回调金额不匹配：期望 ${expectedAmount}，实际 ${actualAmount}`,
            { expectedAmount, actualAmount, transactionId }
          );
        }
      }

      // 7. 超时检查
      if (context.createdAt) {
        const createdTime = new Date(context.createdAt).getTime();
        const timeout = context.timeout || this.options.defaultTimeout;
        if (Date.now() - createdTime > timeout) {
          this.log('支付已超时', { gatewayType, transactionId, createdAt: context.createdAt });

          // 调用超时回调
          if (this.options.onPaymentExpired) {
            await this.safeCallback(this.options.onPaymentExpired, {
              ...callbackResult,
              gateway: gatewayType,
            });
          }

          return {
            result: CALLBACK_RESULT.EXPIRED,
            gateway: gatewayType,
            transactionId,
            callbackResult,
            message: '支付已超时',
            processedAt: new Date().toISOString(),
          };
        }
      }

      // 8. 标记交易为已处理（幂等性）
      if (this.options.enableIdempotency && transactionId) {
        await this.markTransactionProcessed(transactionId, callbackResult.status);
      }

      // 9. 根据状态触发对应回调
      if (callbackResult.status === 'success') {
        await this.handlePaymentSuccess(gatewayType, callbackResult, context);
      } else if (callbackResult.status === 'failed' || callbackResult.status === 'cancelled') {
        await this.handlePaymentFailed(gatewayType, callbackResult, context);
      }

      // 10. 记录处理耗时
      const elapsed = Date.now() - startTime;
      this.log('回调处理完成', { gatewayType, transactionId, status: callbackResult.status, elapsedMs: elapsed });

      return {
        result: callbackResult.status === 'success' ? CALLBACK_RESULT.SUCCESS : CALLBACK_RESULT.FAILED,
        gateway: gatewayType,
        transactionId,
        callbackResult,
        elapsedMs: elapsed,
        processedAt: new Date().toISOString(),
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;

      // 签名错误特殊处理
      if (error instanceof SignatureError) {
        this.log('签名验证失败', { gatewayType, error: error.message });
        return {
          result: CALLBACK_RESULT.INVALID_SIGN,
          gateway: gatewayType,
          error: error.message,
          code: error.code,
          elapsedMs: elapsed,
          processedAt: new Date().toISOString(),
        };
      }

      // 金额不匹配特殊处理
      if (error instanceof AmountMismatchError) {
        this.log('金额校验失败', { gatewayType, error: error.message, extra: error.extra });
        return {
          result: CALLBACK_RESULT.FAILED,
          gateway: gatewayType,
          error: error.message,
          code: error.code,
          extra: error.extra,
          elapsedMs: elapsed,
          processedAt: new Date().toISOString(),
        };
      }

      // 其他错误
      this.log('回调处理异常', { gatewayType, error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * 从回调数据中提取交易ID
   * 不同网关的回调字段名不同
   *
   * @param {string} gatewayType - 网关类型
   * @param {object} payload - 回调数据
   * @returns {string|null} 交易ID
   */
  extractTransactionId(gatewayType, payload) {
    const fieldMap = {
      ABA_PAYWAY: ['tran_id', 'transaction_id'],
      WING_MONEY: ['transaction_id', 'tran_id'],
      ACLEDA_PAYGO: ['transaction_id', 'tran_id'],
    };

    const fields = fieldMap[gatewayType] || ['transaction_id'];
    for (const field of fields) {
      if (payload[field]) {
        return payload[field];
      }
    }

    return null;
  }

  /**
   * 检查交易是否已处理（幂等性）
   * 优先使用外部存储（如Redis），回退到内存Map
   *
   * @param {string} transactionId - 交易ID
   * @returns {Promise<boolean>} 是否已处理
   */
  async isTransactionProcessed(transactionId) {
    // 使用外部存储
    if (this.options.idempotencyStore) {
      try {
        const result = await this.options.idempotencyStore.get(transactionId);
        return result !== null && result !== undefined;
      } catch (error) {
        console.warn(`[回调处理] 幂等性存储查询失败: ${error.message}，回退到内存缓存`);
      }
    }

    // 回退到内存缓存
    return processedTransactions.has(transactionId);
  }

  /**
   * 标记交易为已处理
   *
   * @param {string} transactionId - 交易ID
   * @param {string} status - 处理状态
   */
  async markTransactionProcessed(transactionId, status) {
    const record = {
      transactionId,
      status,
      processedAt: new Date().toISOString(),
    };

    // 使用外部存储
    if (this.options.idempotencyStore) {
      try {
        await this.options.idempotencyStore.set(transactionId, record, 24 * 60 * 60); // TTL 24小时
        return;
      } catch (error) {
        console.warn(`[回调处理] 幂等性存储写入失败: ${error.message}，回退到内存缓存`);
      }
    }

    // 回退到内存缓存（设置最大容量防止内存泄漏）
    if (processedTransactions.size >= 10000) {
      // 清理最早的1000条记录
      const keys = processedTransactions.keys();
      for (let i = 0; i < 1000; i++) {
        const key = keys.next().value;
        if (key) processedTransactions.delete(key);
      }
    }
    processedTransactions.set(transactionId, record);
  }

  /**
   * 处理支付成功
   *
   * @param {string} gatewayType - 网关类型
   * @param {object} callbackResult - 回调结果
   * @param {object} context - 上下文
   */
  async handlePaymentSuccess(gatewayType, callbackResult, context) {
    this.log('支付成功', {
      gateway: gatewayType,
      transactionId: callbackResult.transactionId,
      orderId: callbackResult.orderId,
      amount: callbackResult.amount,
      paidAt: callbackResult.paidAt,
    });

    // 调用业务成功回调
    if (this.options.onPaymentSuccess) {
      await this.safeCallback(this.options.onPaymentSuccess, callbackResult);
    }

    // 发送通知
    if (this.options.notifyService) {
      await this.safeCallback(this.options.notifyService, {
        type: 'payment_success',
        gateway: gatewayType,
        ...callbackResult,
      });
    }
  }

  /**
   * 处理支付失败
   *
   * @param {string} gatewayType - 网关类型
   * @param {object} callbackResult - 回调结果
   * @param {object} context - 上下文
   */
  async handlePaymentFailed(gatewayType, callbackResult, context) {
    this.log('支付失败', {
      gateway: gatewayType,
      transactionId: callbackResult.transactionId,
      orderId: callbackResult.orderId,
      status: callbackResult.status,
    });

    // 调用业务失败回调
    if (this.options.onPaymentFailed) {
      await this.safeCallback(this.options.onPaymentFailed, callbackResult);
    }

    // 发送通知
    if (this.options.notifyService) {
      await this.safeCallback(this.options.notifyService, {
        type: 'payment_failed',
        gateway: gatewayType,
        ...callbackResult,
      });
    }
  }

  /**
   * 安全执行回调函数（捕获异常不影响主流程）
   *
   * @param {function} callback - 回调函数
   * @param {object} data - 回调数据
   */
  async safeCallback(callback, data) {
    try {
      await callback(data);
    } catch (error) {
      console.error(`[回调处理] 业务回调执行失败: ${error.message}`, error);
    }
  }

  /**
   * 获取网关实例
   *
   * @param {string} gatewayType - 网关类型
   * @returns {Gateway|null} 网关实例
   */
  getGateway(gatewayType) {
    return this.gateways[gatewayType] || null;
  }

  /**
   * 注册网关实例
   *
   * @param {string} gatewayType - 网关类型
   * @param {Gateway} gateway - 网关实例
   */
  registerGateway(gatewayType, gateway) {
    this.gateways[gatewayType] = gateway;
  }

  /**
   * 自动路由回调到对应网关
   * 根据回调参数特征自动识别网关类型
   *
   * @param {object} payload - 回调数据
   * @param {string} signature - 签名
   * @param {object} context - 上下文
   * @returns {Promise<object>} 处理结果
   */
  async autoRoute(payload, signature, context = {}) {
    // 根据回调参数特征识别网关
    const gatewayType = this.detectGatewayType(payload);

    if (!gatewayType) {
      throw new ValidationError('无法从回调数据中自动识别网关类型，请手动指定gatewayType');
    }

    return this.handle(gatewayType, payload, signature, context);
  }

  /**
   * 根据回调参数特征检测网关类型
   *
   * @param {object} payload - 回调数据
   * @returns {string|null} 网关类型或null
   */
  detectGatewayType(payload) {
    // ABA PayWay 特征：通常包含 merchant_id 和 tran_id
    if (payload.merchant_id && payload.tran_id && payload.hash) {
      return 'ABA_PAYWAY';
    }

    // Wing Money 特征：通常包含 merchant_id、transaction_id 和 sign
    if (payload.merchant_id && payload.transaction_id && payload.sign && !payload.hash) {
      // 进一步区分Wing和ACLEDA：Wing的status通常是字符串
      if (typeof payload.status === 'string' && ['SUCCESS', 'PENDING', 'FAILED'].includes(payload.status)) {
        return 'WING_MONEY';
      }
    }

    // ACLEDA PayGo 特征：通常包含 merchant_id、transaction_id 和 sign，status是数字
    if (payload.merchant_id && payload.transaction_id && payload.sign) {
      if (typeof payload.status === 'number' || (typeof payload.status === 'string' && /^[0-4]$/.test(payload.status))) {
        return 'ACLEDA_PAYGO';
      }
    }

    // 根据商户ID前缀判断（如果配置了特定前缀）
    const merchantId = payload.merchant_id || payload.merchantId || '';
    if (merchantId.startsWith('ABA_')) return 'ABA_PAYWAY';
    if (merchantId.startsWith('WING_')) return 'WING_MONEY';
    if (merchantId.startsWith('ACLD_')) return 'ACLEDA_PAYGO';

    return null;
  }

  /**
   * 获取已处理交易统计（调试用）
   *
   * @returns {object} 统计信息
   */
  getStats() {
    return {
      processedCount: processedTransactions.size,
      processedTransactions: Array.from(processedTransactions.entries()).slice(-100), // 只返回最近100条
    };
  }

  /**
   * 清空已处理交易缓存（调试用）
   */
  clearProcessedCache() {
    processedTransactions.clear();
  }

  /**
   * 记录脱敏日志
   */
  log(action, data = {}) {
    const logEntry = {
      module: 'CallbackHandler',
      action,
      data: sanitizeSensitiveData(data),
      timestamp: new Date().toISOString(),
    };
    console.log(`[回调处理] ${action}: ${JSON.stringify(logEntry)}`);
  }
}

module.exports = {
  PaymentCallbackHandler,
  CALLBACK_RESULT,
};
