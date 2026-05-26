/**
 * ==========================================
 * 管理员路由模块 (Admin Routes)
 * ==========================================
 * 提供后台管理相关的接口：
 * - GET  /api/admin/users           用户列表（分页/搜索）
 * - PUT  /api/admin/users/:id/status 修改用户状态（启用/禁用）
 * - GET  /api/admin/orders          订单管理列表
 * - PUT  /api/admin/orders/:id/assign 分配骑手
 * - GET  /api/admin/overview        数据总览
 */

'use strict';

const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { success, paginated } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const orderService = require('../services/orderService');
const notificationService = require('../services/notificationService');

/**
 * 注册管理员路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function adminRoutes(fastify, options) {

  /**
   * GET /api/admin/users
   * 用户列表 - 仅管理员
   * Query: page, limit, role(角色筛选), q(关键词搜索), status
   */
  fastify.get('/users', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '用户列表（管理员）',
      tags: ['管理员'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
          role: { type: 'string', description: '角色筛选: customer/rider/admin' },
          status: { type: 'string', description: '状态筛选: active/inactive/banned' },
          q: { type: 'string', description: '搜索关键词（手机号/昵称）' },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 10, role, status, q } = request.query;
    const query = {};

    if (role) query.role = role;
    if (status) query.status = status;
    if (q) {
      query.$or = [
        { phone: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    return paginated({ list: users, total, page: Number(page), limit: Number(limit) });
  });

  /**
   * PUT /api/admin/users/:id/status
   * 修改用户状态 - 仅管理员
   * Body: { status: 'active'|'inactive'|'banned' }
   */
  fastify.put('/users/:id/status', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '修改用户状态（管理员）',
      tags: ['管理员'],
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'banned'] },
        },
      },
    },
  }, async (request, reply) => {
    const { status } = request.body;
    const user = await User.findByIdAndUpdate(
      request.params.id,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      throw new BusinessError(404005, '用户不存在', 404);
    }

    return success({ data: user, message: `用户状态已更新为「${status}」` });
  });

  /**
   * GET /api/admin/orders
   * 订单管理列表 - 仅管理员
   * 支持按状态筛选、按订单号搜索
   */
  fastify.get('/orders', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '订单管理列表（管理员）',
      tags: ['管理员'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
          status: { type: 'string' },
          orderNo: { type: 'string', description: '订单号搜索' },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 10, status, orderNo } = request.query;
    const query = {};

    if (status) query.status = status;
    if (orderNo) query.orderNo = { $regex: orderNo, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name phone')
        .populate('rider', 'name phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Order.countDocuments(query),
    ]);

    return paginated({ list: orders, total, page: Number(page), limit: Number(limit) });
  });

  /**
   * PUT /api/admin/orders/:id/assign
   * 分配骑手到订单 - 仅管理员
   * Body: { riderId: 骑手用户ID }
   */
  fastify.put('/orders/:id/assign', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '分配骑手（管理员）',
      tags: ['管理员'],
      body: {
        type: 'object',
        required: ['riderId'],
        properties: {
          riderId: { type: 'string', description: '骑手用户ID' },
        },
      },
    },
  }, async (request, reply) => {
    const { riderId } = request.body;

    // 校验骑手是否存在且角色为 rider
    const rider = await User.findOne({ _id: riderId, role: 'rider' });
    if (!rider) {
      throw new BusinessError(400019, '指定的骑手不存在或角色不正确', 400);
    }

    const order = await orderService.assignRider(request.params.id, riderId);

    // 发送骑手分配通知给用户
    await notificationService.sendRiderAssignedNotification(
      order.user,
      order.orderNo,
      rider.name
    );

    // 发送新订单通知给骑手
    const address = `${order.address?.province || ''}${order.address?.city || ''}${order.address?.detail || ''}`;
    await notificationService.sendNewOrderToRider(riderId, order.orderNo, address);

    return success({ data: order, message: `订单已分配给骑手「${rider.name}」` });
  });

  /**
   * GET /api/admin/overview
   * 数据总览 - 仅管理员
   * 返回核心业务数据的汇总统计
   */
  fastify.get('/overview', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '数据总览（管理员）',
      tags: ['管理员'],
    },
  }, async (request, reply) => {
    const moment = require('moment-timezone');
    const now = moment().tz('Asia/Phnom_Penh');
    const todayStart = now.clone().startOf('day').toDate();
    const todayEnd = now.clone().endOf('day').toDate();
    const weekStart = now.clone().subtract(6, 'days').startOf('day').toDate();
    const monthStart = now.clone().startOf('month').toDate();

    const [
      totalUsers,
      totalOrders,
      totalRevenue,
      totalProducts,
      todayOrders,
      todayRevenue,
      weekOrders,
      weekRevenue,
      monthRevenue,
      customerCount,
      riderCount,
      pendingOrders,
      completedOrders,
      cancelledOrders,
    ] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Product.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Order.aggregate([{ $match: { createdAt: { $gte: todayStart, $lte: todayEnd }, paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Order.countDocuments({ createdAt: { $gte: weekStart } }),
      Order.aggregate([{ $match: { createdAt: { $gte: weekStart }, paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Order.aggregate([{ $match: { createdAt: { $gte: monthStart }, paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'rider' }),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'completed' }),
      Order.countDocuments({ status: 'cancelled' }),
    ]);

    return success({
      data: {
        users: {
          total: totalUsers,
          customers: customerCount,
          riders: riderCount,
        },
        orders: {
          total: totalOrders,
          today: todayOrders,
          thisWeek: weekOrders,
          pending: pendingOrders,
          completed: completedOrders,
          cancelled: cancelledOrders,
        },
        revenue: {
          total: totalRevenue[0]?.total || 0,
          today: todayRevenue[0]?.total || 0,
          thisWeek: weekRevenue[0]?.total || 0,
          thisMonth: monthRevenue[0]?.total || 0,
        },
        products: {
          total: totalProducts,
        },
      },
      message: '获取数据总览成功',
    });
  });
}

module.exports = adminRoutes;
