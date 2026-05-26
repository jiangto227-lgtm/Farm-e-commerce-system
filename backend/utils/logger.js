/**
 * ==========================================
 * 日志工具模块 (Logger Utilities)
 * ==========================================
 * 提供应用日志记录功能，支持不同日志级别
 * 在生产环境中可将日志写入文件或接入外部日志服务
 * 使用统一的日志格式，包含时间戳、级别、消息和可选的上下文数据
 */

'use strict';

const moment = require('moment-timezone');

/**
 * 获取当前时间字符串（柬埔寨时区）
 * @returns {string} 格式化的时间字符串
 */
function getTimestamp() {
  return moment().tz('Asia/Phnom_Penh').format('YYYY-MM-DD HH:mm:ss');
}

/**
 * 日志级别枚举
 */
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * 当前日志级别（从环境变量读取，默认 INFO）
 */
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';

/**
 * 日志级别优先级（数字越大优先级越高）
 */
const LEVEL_PRIORITY = {
  [LOG_LEVELS.DEBUG]: 0,
  [LOG_LEVELS.INFO]: 1,
  [LOG_LEVELS.WARN]: 2,
  [LOG_LEVELS.ERROR]: 3,
};

/**
 * 判断某个级别的日志是否应该输出
 * @param {string} level - 日志级别
 * @returns {boolean}
 */
function shouldLog(level) {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[CURRENT_LOG_LEVEL];
}

/**
 * 格式化日志输出
 * @param {string} level - 日志级别
 * @param {string} message - 日志消息
 * @param {Object} context - 额外的上下文数据
 * @returns {string} 格式化后的日志字符串
 */
function formatLog(level, message, context = null) {
  const timestamp = getTimestamp();
  const levelTag = `[${level}]`;
  const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
  return `${timestamp} ${levelTag.padEnd(7)} ${message}${contextStr}`;
}

/**
 * 记录调试日志
 * @param {string} message - 日志消息
 * @param {Object} context - 上下文数据
 */
function debug(message, context) {
  if (shouldLog(LOG_LEVELS.DEBUG)) {
    console.debug(formatLog(LOG_LEVELS.DEBUG, message, context));
  }
}

/**
 * 记录信息日志
 * @param {string} message - 日志消息
 * @param {Object} context - 上下文数据
 */
function info(message, context) {
  if (shouldLog(LOG_LEVELS.INFO)) {
    console.info(formatLog(LOG_LEVELS.INFO, message, context));
  }
}

/**
 * 记录警告日志
 * @param {string} message - 日志消息
 * @param {Object} context - 上下文数据
 */
function warn(message, context) {
  if (shouldLog(LOG_LEVELS.WARN)) {
    console.warn(formatLog(LOG_LEVELS.WARN, message, context));
  }
}

/**
 * 记录错误日志
 * @param {string} message - 日志消息
 * @param {Error|Object} error - 错误对象或上下文
 */
function error(message, err) {
  if (shouldLog(LOG_LEVELS.ERROR)) {
    const context = err instanceof Error 
      ? { name: err.name, message: err.message, stack: err.stack }
      : err;
    console.error(formatLog(LOG_LEVELS.ERROR, message, context));
  }
}

/**
 * 记录请求日志（用于请求中间件）
 * @param {Object} request - Fastify 请求对象
 * @param {number} statusCode - 响应状态码
 * @param {number} responseTime - 响应时间（毫秒）
 */
function requestLog(request, statusCode, responseTime) {
  const level = statusCode >= 400 ? LOG_LEVELS.ERROR : statusCode >= 300 ? LOG_LEVELS.WARN : LOG_LEVELS.INFO;
  const message = `${request.method} ${request.url} => ${statusCode} (${responseTime}ms)`;
  if (shouldLog(level)) {
    console.log(formatLog(level, message, { ip: request.ip, userAgent: request.headers['user-agent'] }));
  }
}

module.exports = {
  debug,
  info,
  warn,
  error,
  requestLog,
  getTimestamp,
  LOG_LEVELS,
};
