/**
 * ==========================================
 * 用户路由模块 (User Routes)
 * ==========================================
 * 处理用户个人信息和收货地址相关的接口：
 * - GET    /api/users/profile      获取个人资料
 * - PUT    /api/users/profile      更新个人资料
 * - GET    /api/users/addresses    获取地址列表
 * - POST   /api/users/addresses    添加新地址
 * - PUT    /api/users/addresses/:id 更新地址
 * - DELETE /api/users/addresses/:id 删除地址
 * - PUT    /api/users/addresses/:id/default 设为默认地址
 */

'use strict';

const User = require('../models/User');
const Address = require('../models/Address');
const { verifyToken } = require('../middleware/auth');
const { validate, addressSchemas } = require('../utils/validator');
const { success } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');

/**
 * 注册用户路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function userRoutes(fastify, options) {

  // ==================== 个人资料 ====================

  /**
   * GET /api/users/profile
   * 获取当前用户的个人资料
   */
  fastify.get('/profile', {
    onRequest: [verifyToken],
    schema: {
      description: '获取个人资料',
      tags: ['用户'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      throw new BusinessError(404005, '用户不存在', 404);
    }

    return success({ data: user.toSafeObject(), message: '获取个人资料成功' });
  });

  /**
   * PUT /api/users/profile
   * 更新个人资料（昵称、头像等，不允许修改手机号和角色）
   */
  fastify.put('/profile', {
    onRequest: [verifyToken],
    schema: {
      description: '更新个人资料',
      tags: ['用户'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '昵称' },
          avatar: { type: 'string', description: '头像URL' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const updateData = {};

    // 只允许更新特定字段
    if (request.body.name) updateData.name = request.body.name.trim();
    if (request.body.avatar !== undefined) updateData.avatar = request.body.avatar;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new BusinessError(404005, '用户不存在', 404);
    }

    return success({ data: user.toSafeObject(), message: '个人资料更新成功' });
  });

  // ==================== 收货地址 ====================

  /**
   * GET /api/users/addresses
   * 获取当前用户的收货地址列表
   */
  fastify.get('/addresses', {
    onRequest: [verifyToken],
    schema: {
      description: '获取收货地址列表',
      tags: ['用户'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const addresses = await Address.find({ user: userId })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();

    return success({ data: addresses, message: '获取地址列表成功' });
  });

  /**
   * POST /api/users/addresses
   * 添加新的收货地址
   */
  fastify.post('/addresses', {
    onRequest: [verifyToken],
    schema: {
      description: '添加收货地址',
      tags: ['用户'],
      body: {
        type: 'object',
        required: ['name', 'phone', 'detail'],
        properties: {
          name: { type: 'string', description: '收货人姓名' },
          phone: { type: 'string', description: '收货人电话' },
          province: { type: 'string' },
          city: { type: 'string' },
          district: { type: 'string' },
          detail: { type: 'string', description: '详细地址' },
          tag: { type: 'string', description: '标签（家/公司等）' },
          isDefault: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const data = validate(addressSchemas.create, request.body);

    const address = await Address.create({
      ...data,
      user: userId,
    });

    return success({ data: address, message: '地址添加成功' });
  });

  /**
   * PUT /api/users/addresses/:id
   * 更新收货地址
   */
  fastify.put('/addresses/:id', {
    onRequest: [verifyToken],
    schema: {
      description: '更新收货地址',
      tags: ['用户'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          province: { type: 'string' },
          city: { type: 'string' },
          district: { type: 'string' },
          detail: { type: 'string' },
          tag: { type: 'string' },
          isDefault: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const addressId = request.params.id;

    // 只能更新自己的地址
    const address = await Address.findOneAndUpdate(
      { _id: addressId, user: userId },
      { $set: request.body },
      { new: true, runValidators: true }
    );

    if (!address) {
      throw new BusinessError(404008, '地址不存在或无权限修改', 404);
    }

    return success({ data: address, message: '地址更新成功' });
  });

  /**
   * DELETE /api/users/addresses/:id
   * 删除收货地址
   */
  fastify.delete('/addresses/:id', {
    onRequest: [verifyToken],
    schema: {
      description: '删除收货地址',
      tags: ['用户'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const addressId = request.params.id;

    const address = await Address.findOneAndDelete({ _id: addressId, user: userId });

    if (!address) {
      throw new BusinessError(404008, '地址不存在或无权限删除', 404);
    }

    return success({ data: null, message: '地址删除成功' });
  });

  /**
   * PUT /api/users/addresses/:id/default
   * 设为默认地址
   */
  fastify.put('/addresses/:id/default', {
    onRequest: [verifyToken],
    schema: {
      description: '设为默认地址',
      tags: ['用户'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const addressId = request.params.id;

    // 先取消用户的所有默认地址
    await Address.updateMany(
      { user: userId, isDefault: true },
      { isDefault: false }
    );

    // 设置指定地址为默认
    const address = await Address.findOneAndUpdate(
      { _id: addressId, user: userId },
      { isDefault: true },
      { new: true }
    );

    if (!address) {
      throw new BusinessError(404008, '地址不存在', 404);
    }

    return success({ data: address, message: '默认地址设置成功' });
  });
}

module.exports = userRoutes;
