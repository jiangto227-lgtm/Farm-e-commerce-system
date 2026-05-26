/**
 * ==========================================
 * 数据分析路由模块 (Analytics Routes)
 * ==========================================
 * 提供后台仪表盘和报表所需的数据接口：
 * - GET /api/analytics/dashboard  仪表盘KPI数据（今日订单、销售额、用户数等）
 * - GET /api/analytics/revenue    收入趋势（支持days参数）
 * - GET /api/analytics/orders     订单统计（按状态分组）
 * - GET /api/analytics/products   产品热销排行
 * - GET /api/analytics/payments   支付方式分布
 */

'use strict';

const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { success } = require('../utils/response');
const productService = require('../services/productService');
const paymentService = require('../services/paymentService');

/**
 * 获取日期范围
 * @param {number} days - 最近几天
 * @returns {Object} { startDate, endDate }
 */
function getDateRange(days = 7) {
  const moment = require('moment-timezone');
  const endDate = moment().tz('Asia/Phnom_Penh').endOf('day').toDate();
  const startDate = moment().tz('Asia/Phnom_Penh').subtract(days - 1, 'days').startOf('day').toDate();
  return { startDate, endDate };
}

/**
 * 注册数据分析路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function analyticsRoutes(fastify, options) {

  /**
   * GET /api/analytics/dashboard
   * 仪表盘KPI数据 - 仅管理员
   * 返回今日关键指标：订单数、销售额、用户数、待处理订单等
   */
  fastify.get('/dashboard', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '仪表盘KPI数据（管理员）',
      tags: ['数据分析'],
    },
  }, async (request, reply) => {
    const moment = require('moment-timezone');
    const todayStart = moment().tz('Asia/Phnom_Penh').startOf('day').toDate();
    const todayEnd = moment().tz('Asia/Phnom_Penh').endOf('day').toDate();
    const yesterdayStart = moment().tz('Asia/Phnom_Penh').subtract(1, 'days').startOf('day').toDate();
    const yesterdayEnd = moment().tz('Asia/Phnom_Penh').subtract(1, 'days').endOf('day').toDate();

    // 并行查询各项指标
    const [
      // 今日订单数
      todayOrderCount,
      // 昨日订单数
      yesterdayOrderCount,
      // 今日销售额
      todayRevenue,
      // 昨日销售额
      yesterdayRevenue,
      // 总用户数
      totalUsers,
      // 新注册用户（今日）
      newUsersToday,
      // 待处理订单数
      pendingOrders,
      // 配送中订单数
      deliveringOrders,
      // 总产品数
      totalProducts,
      // 低库存产品数（库存<10）
      lowStockProducts,
      // 待审核骑手申请数
      pendingRiderApplications,
      // 待处理争议数
      pendingDisputes,
    ] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Order.countDocuments({ createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: todayStart, $lte: todayEnd }, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd }, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'delivering' }),
      Product.countDocuments(),
      Product.countDocuments({ stock: { $lt: 10 } }),
      User.countDocuments({ 'riderInfo.verifyStatus': 'pending' }),
      require('../models/Dispute').countDocuments({ status: 'pending' }),
    ]);

    const todayRevenueValue = todayRevenue[0]?.total || 0;
    const yesterdayRevenueValue = yesterdayRevenue[0]?.total || 0;

    // 计算环比变化
    const orderChange = yesterdayOrderCount === 0
      ? 100
      : ((todayOrderCount - yesterdayOrderCount) / yesterdayOrderCount * 100).toFixed(1);
    const revenueChange = yesterdayRevenueValue === 0
      ? 100
      : ((todayRevenueValue - yesterdayRevenueValue) / yesterdayRevenueValue * 100).toFixed(1);

    return success({
      data: {
        kpi: {
          todayOrders: todayOrderCount,
          todayRevenue: todayRevenueValue,
          totalUsers,
          newUsersToday,
          pendingOrders,
          deliveringOrders,
        },
        trends: {
          orderChange: Number(orderChange),
          revenueChange: Number(revenueChange),
        },
        alerts: {
          lowStockProducts,
          pendingRiderApplications,
          pendingDisputes,
        },
      },
      message: '获取仪表盘数据成功',
    });
  });

  /**
   * GET /api/analytics/revenue
   * 收入趋势 - 仅管理员
   * Query: days（默认7天）
   */
  fastify.get('/revenue', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '收入趋势（管理员）',
      tags: ['数据分析'],
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', default: 7 },
        },
      },
    },
  }, async (request, reply) => {
    const days = Number(request.query.days) || 7;
    const { startDate, endDate } = getDateRange(days);
    const moment = require('moment-timezone');

    // 按天聚合收入数据
    const revenueData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          paymentStatus: 'paid',
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          revenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    // 格式化日期
    const formatted = revenueData.map(item => ({
      date: moment().tz('Asia/Phnom_Penh').year(item._id.year).month(item._id.month - 1).date(item._id.day).format('YYYY-MM-DD'),
      revenue: item.revenue,
      orderCount: item.orderCount,
    }));

    // 计算汇总
    const totalRevenue = formatted.reduce((sum, item) => sum + item.revenue, 0);
    const totalOrders = formatted.reduce((sum, item) => sum + item.orderCount, 0);

    return success({
      data: {
        daily: formatted,
        summary: {
          totalRevenue,
          totalOrders,
          averageDailyRevenue: formatted.length > 0 ? Math.round(totalRevenue / formatted.length) : 0,
        },
      },
      message: '获取收入趋势成功',
    });
  });

  /**
   * GET /api/analytics/orders
   * 订单统计 - 仅管理员
   * 按状态分组统计
   */
  fastify.get('/orders', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '订单统计（管理员）',
      tags: ['数据分析'],
    },
  }, async (request, reply) => {
    // 各状态订单数量
    const statusStats = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$totalAmount' } } },
      { $sort: { count: -1 } },
    ]);

    // 今日订单
    const { startDate: todayStart, endDate: todayEnd } = getDateRange(1);
    const todayOrderStats = await Order.aggregate([
      { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // 本周订单
    const { startDate: weekStart, endDate: weekEnd } = getDateRange(7);
    const weekOrderStats = await Order.aggregate([
      { $match: { createdAt: { $gte: weekStart, $lte: weekEnd } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return success({
      data: {
        overall: statusStats.map(s => ({ status: s._id, count: s.count, totalAmount: s.totalAmount })),
        today: todayOrderStats.map(s => ({ status: s._id, count: s.count })),
        thisWeek: weekOrderStats.map(s => ({ status: s._id, count: s.count })),
      },
      message: '获取订单统计成功',
    });
  });

  /**
   * GET /api/analytics/products
   * 产品热销排行 - 仅管理员
   */
  fastify.get('/products', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '产品热销排行（管理员）',
      tags: ['数据分析'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const limit = Number(request.query.limit) || 10;

    // 热销排行（按销量）
    const topSelling = await productService.getTopSellingProducts(limit);

    // 低库存产品
    const lowStock = await Product.find({ stock: { $lt: 10 } })
      .select('name stock price sales status')
      .sort({ stock: 1 })
      .limit(10)
      .lean();

    // 新品上架数（最近7天）
    const { startDate } = getDateRange(7);
    const newProductsCount = await Product.countDocuments({
      createdAt: { $gte: startDate },
    });

    return success({
      data: {
        topSelling,
        lowStockAlert: lowStock,
        newProductsThisWeek: newProductsCount,
      },
      message: '获取产品分析数据成功',
    });
  });

  /**
   * GET /api/analytics/payments
   * 支付方式分布 - 仅管理员
   */
  fastify.get('/payments', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '支付方式分布（管理员）',
      tags: ['数据分析'],
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', default: 30 },
        },
      },
    },
  }, async (request, reply) => {
    const days = Number(request.query.days) || 30;
    const { startDate, endDate } = getDateRange(days);

    // 支付方式分布
    const methodStats = await paymentService.getPaymentMethodStats(startDate, endDate);

    // 支付成功/失败统计
    const statusStats = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    // 退款统计
    const refundStats = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'refunded',
        },
      },
      {
        $group: {
          _id: null,
          refundCount: { $sum: 1 },
          refundAmount: { $sum: '$refundAmount' },
        },
      },
    ]);

    return success({
      data: {
        methodDistribution: methodStats,
        statusDistribution: statusStats.map(s => ({
          status: s._id,
          count: s.count,
          totalAmount: s.totalAmount,
        })),
        refundSummary: refundStats[0] || { refundCount: 0, refundAmount: 0 },
      },
      message: '获取支付分析数据成功',
    });
  });
}

module.exports = analyticsRoutes;
