/**
 * ==========================================
 * 数据库连接配置模块
 * ==========================================
 * 负责建立与 MongoDB 的连接，处理连接事件和错误
 */

'use strict';

const mongoose = require('mongoose');

/**
 * 连接 MongoDB 数据库
 * @param {string} uri - MongoDB 连接字符串
 */
async function connectDatabase(uri) {
  try {
    // 配置 mongoose 连接选项
    const options = {
      maxPoolSize: 10,           // 连接池最大连接数
      serverSelectionTimeoutMS: 5000,  // 服务器选择超时时间
      socketTimeoutMS: 45000,    // Socket 超时时间
      bufferCommands: false,     // 禁用缓冲，连接前不排队
    };

    await mongoose.connect(uri, options);
    console.log('[数据库] MongoDB 连接成功');

    // 监听连接事件
    mongoose.connection.on('connected', () => {
      console.log('[数据库] MongoDB 已连接');
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[数据库] MongoDB 连接已断开');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[数据库] MongoDB 重新连接成功');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[数据库] MongoDB 连接错误:', err.message);
    });

    // 应用关闭时断开数据库连接
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('[数据库] 应用关闭，MongoDB 连接已断开');
      process.exit(0);
    });

  } catch (err) {
    console.error('[数据库] MongoDB 连接失败:', err.message);
    throw err;
  }
}

module.exports = { connectDatabase };
