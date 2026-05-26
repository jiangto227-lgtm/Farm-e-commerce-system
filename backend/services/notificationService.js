/**
 * ==========================================
 * 通知服务模块 (Notification Service)
 * ==========================================
 * 处理系统内的各类通知，包括：
 * - 订单状态变更通知
 * - 支付结果通知
 * - 骑手分配通知
 * - 争议处理结果通知
 * 当前版本使用控制台日志模拟，生产环境可扩展为推送/短信/邮件
 */

'use strict';

const logger = require('../utils/logger');

/**
 * 发送订单状态变更通知
 * @param {string} userId - 用户ID
 * @param {string} orderNo - 订单编号
 * @param {string} status - 新状态
 * @param {string} message - 附加消息
 */
async function sendOrderStatusNotification(userId, orderNo, status, message = '') {
  const statusTextMap = {
    pending: '待处理',
    processing: '处理中',
    delivering: '配送中',
    delivered: '已送达',
    completed: '已完成',
    cancelled: '已取消',
    refunded: '已退款',
  };

  const statusText = statusTextMap[status] || status;
  const content = `您的订单 ${orderNo} 状态已更新为「${statusText}」${message ? '，' + message : ''}`;

  // 记录通知日志
  logger.info(`[通知] 订单状态变更`, {
    userId,
    orderNo,
    status,
    content,
  });

  // TODO: 生产环境接入推送服务（Firebase/OneSignal等）
  // TODO: 生产环境发送短信通知

  return { success: true, content };
}

/**
 * 发送支付成功通知
 * @param {string} userId - 用户ID
 * @param {string} orderNo - 订单编号
 * @param {number} amount - 支付金额
 */
async function sendPaymentNotification(userId, orderNo, amount) {
  const content = `订单 ${orderNo} 支付成功，金额 ${amount} KHR`;

  logger.info(`[通知] 支付成功`, { userId, orderNo, amount, content });

  return { success: true, content };
}

/**
 * 发送退款通知
 * @param {string} userId - 用户ID
 * @param {string} orderNo - 订单编号
 * @param {number} amount - 退款金额
 * @param {string} reason - 退款原因
 */
async function sendRefundNotification(userId, orderNo, amount, reason = '') {
  const content = `订单 ${orderNo} 已退款 ${amount} KHR${reason ? '，原因：' + reason : ''}`;

  logger.info(`[通知] 退款通知`, { userId, orderNo, amount, reason, content });

  return { success: true, content };
}

/**
 * 发送骑手分配通知（给用户）
 * @param {string} userId - 用户ID
 * @param {string} orderNo - 订单编号
 * @param {string} riderName - 骑手姓名
 */
async function sendRiderAssignedNotification(userId, orderNo, riderName) {
  const content = `订单 ${orderNo} 已分配骑手「${riderName}」，正在为您配送中`;

  logger.info(`[通知] 骑手分配`, { userId, orderNo, riderName, content });

  return { success: true, content };
}

/**
 * 发送新订单通知（给骑手）
 * @param {string} riderId - 骑手用户ID
 * @param {string} orderNo - 订单编号
 * @param {string} address - 配送地址
 */
async function sendNewOrderToRider(riderId, orderNo, address) {
  const content = `您有新的配送任务，订单号 ${orderNo}，配送地址：${address}`;

  logger.info(`[通知] 新订单给骑手`, { riderId, orderNo, address, content });

  return { success: true, content };
}

/**
 * 发送争议处理结果通知
 * @param {string} userId - 用户ID
 * @param {string} disputeNo - 争议编号
 * @param {string} result - 处理结果
 * @param {string} remark - 处理说明
 */
async function sendDisputeResultNotification(userId, disputeNo, result, remark = '') {
  const resultTextMap = {
    refunded: '已同意退款',
    rejected: '已拒绝申请',
    negotiated: '协商解决',
  };

  const content = `您的争议 ${disputeNo} 已处理：${resultTextMap[result] || result}${remark ? '，' + remark : ''}`;

  logger.info(`[通知] 争议处理结果`, { userId, disputeNo, result, content });

  return { success: true, content };
}

/**
 * 发送骑手申请审核结果通知
 * @param {string} userId - 用户ID
 * @param {boolean} approved - 是否通过
 * @param {string} remark - 审核备注
 */
async function sendRiderVerifyNotification(userId, approved, remark = '') {
  const content = approved
    ? `恭喜！您的骑手入驻申请已通过审核${remark ? '，' + remark : ''}`
    : `您的骑手入驻申请未通过审核${remark ? '，原因：' + remark : ''}`;

  logger.info(`[通知] 骑手审核结果`, { userId, approved, content });

  return { success: true, content };
}

module.exports = {
  sendOrderStatusNotification,
  sendPaymentNotification,
  sendRefundNotification,
  sendRiderAssignedNotification,
  sendNewOrderToRider,
  sendDisputeResultNotification,
  sendRiderVerifyNotification,
};
