/**
 * ==========================================
 * 骑手路由模块 (Rider Routes)
 * ==========================================
 * 处理骑手入驻和管理相关的接口：
 * - POST /api/riders/apply                  提交骑手入驻申请
 * - GET  /api/riders/applications           申请列表（管理员）
 * - PUT  /api/riders/applications/:id/approve 审核通过（管理员）
 * - PUT  /api/riders/applications/:id/reject  审核拒绝（管理员）
 * - GET  /api/riders                        骑手列表
 */

'use strict';

const Rider = require('../models/Rider');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate, riderSchemas } = require('../utils/validator');
const { success, paginated } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const notificationService = require('../services/notificationService');

/**
 * 注册骑手路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function riderRoutes(fastify, options) {

  /**
   * POST /api/riders/apply
   * 提交骑手入驻申请 - 需要登录
   */
  fastify.post('/apply', {
    onRequest: [verifyToken],
    schema: {
      description: '提交骑手入驻申请',
      tags: ['骑手'],
      body: {
        type: 'object',
        required: ['realName', 'phone', 'idCard', 'vehicleType', 'vehiclePlate'],
        properties: {
          realName: { type: 'string', description: '真实姓名' },
          phone: { type: 'string', description: '联系电话' },
          idCard: { type: 'string', description: '身份证号' },
          idCardFront: { type: 'string', description: '身份证正面照URL' },
          idCardBack: { type: 'string', description: '身份证反面照URL' },
          vehicleType: { type: 'string', description: '车辆类型' },
          vehiclePlate: { type: 'string', description: '车辆牌照' },
          licensePhoto: { type: 'string', description: '驾驶证照片URL' },
          deliveryArea: { type: 'string', description: '配送区域' },
          emergencyContact: { type: 'string' },
          emergencyPhone: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const data = validate(riderSchemas.apply, request.body);

    // 检查是否已提交过申请
    const existing = await Rider.findOne({ user: userId });
    if (existing) {
      if (existing.status === 'pending') {
        throw new BusinessError(409003, '您已提交过申请，正在审核中', 409);
      }
      if (existing.status === 'approved') {
        throw new BusinessError(409004, '您的申请已通过审核', 409);
      }
      // 被拒绝可以重新申请，删除旧记录
      await Rider.deleteOne({ user: userId });
    }

    // 检查用户是否已经是骑手
    const user = await User.findById(userId);
    if (user.role === 'rider') {
      throw new BusinessError(409005, '您已经是骑手，无需重复申请', 409);
    }

    // 创建申请记录
    const application = await Rider.create({
      ...data,
      user: userId,
      status: 'pending',
    });

    return success({ data: application, message: '入驻申请已提交，请等待审核' });
  });

  /**
   * GET /api/riders/applications
   * 获取骑手申请列表 - 仅管理员
   * Query: status(筛选状态), page, limit
   */
  fastify.get('/applications', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '获取骑手申请列表（管理员）',
      tags: ['骑手'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', description: '筛选状态: pending/approved/rejected' },
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const { status, page = 1, limit = 10 } = request.query;
    const query = {};

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [applications, total] = await Promise.all([
      Rider.find(query)
        .populate('user', 'name phone avatar')
        .populate('verifiedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Rider.countDocuments(query),
    ]);

    return paginated({ list: applications, total, page: Number(page), limit: Number(limit) });
  });

  /**
   * PUT /api/riders/applications/:id/approve
   * 审核通过骑手申请 - 仅管理员
   */
  fastify.put('/applications/:id/approve', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '审核通过骑手申请（管理员）',
      tags: ['骑手'],
      body: {
        type: 'object',
        properties: {
          remark: { type: 'string', description: '审核备注' },
        },
      },
    },
  }, async (request, reply) => {
    const adminId = request.user.userId;
    const applicationId = request.params.id;
    const remark = request.body?.remark || '';

    const application = await Rider.findById(applicationId);
    if (!application) {
      throw new BusinessError(404009, '申请记录不存在', 404);
    }
    if (application.status !== 'pending') {
      throw new BusinessError(400015, '该申请已被处理，无法重复审核', 400);
    }

    // 更新申请状态
    application.status = 'approved';
    application.verifiedBy = adminId;
    application.verifiedAt = new Date();
    application.verifyRemark = remark;
    await application.save();

    // 同步更新用户角色为 rider
    await User.findByIdAndUpdate(application.user, {
      role: 'rider',
      'riderInfo.realName': application.realName,
      'riderInfo.idCard': application.idCard,
      'riderInfo.vehicleType': application.vehicleType,
      'riderInfo.vehiclePlate': application.vehiclePlate,
      'riderInfo.deliveryArea': application.deliveryArea,
      'riderInfo.verifyStatus': 'approved',
      'riderInfo.verifiedAt': new Date(),
    });

    // 发送审核通过通知
    await notificationService.sendRiderVerifyNotification(application.user, true, remark);

    return success({ data: application, message: '骑手申请已通过审核' });
  });

  /**
   * PUT /api/riders/applications/:id/reject
   * 审核拒绝骑手申请 - 仅管理员
   */
  fastify.put('/applications/:id/reject', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '审核拒绝骑手申请（管理员）',
      tags: ['骑手'],
      body: {
        type: 'object',
        properties: {
          remark: { type: 'string', description: '拒绝原因' },
        },
      },
    },
  }, async (request, reply) => {
    const adminId = request.user.userId;
    const applicationId = request.params.id;
    const remark = request.body?.remark || '不符合入驻要求';

    const application = await Rider.findById(applicationId);
    if (!application) {
      throw new BusinessError(404009, '申请记录不存在', 404);
    }
    if (application.status !== 'pending') {
      throw new BusinessError(400015, '该申请已被处理，无法重复审核', 400);
    }

    // 更新申请状态
    application.status = 'rejected';
    application.verifiedBy = adminId;
    application.verifiedAt = new Date();
    application.verifyRemark = remark;
    await application.save();

    // 发送审核拒绝通知
    await notificationService.sendRiderVerifyNotification(application.user, false, remark);

    return success({ data: application, message: '骑手申请已被拒绝' });
  });

  /**
   * GET /api/riders
   * 获取骑手列表 - 管理员可查看全部，普通用户只查看在线骑手（用于前端展示）
   */
  fastify.get('/', {
    onRequest: [verifyToken],
    schema: {
      description: '获取骑手列表',
      tags: ['骑手'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const role = request.user.role;
    const { page = 1, limit = 10 } = request.query;

    const query = { role: 'rider' };
    const skip = (Number(page) - 1) * Number(limit);

    // 查询骑手用户
    const [riders, total] = await Promise.all([
      User.find(query)
        .select('name phone avatar riderInfo status createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    return paginated({ list: riders, total, page: Number(page), limit: Number(limit) });
  });
}

module.exports = riderRoutes;
