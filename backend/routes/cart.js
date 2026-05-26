/**
 * ==========================================
 * 购物车路由模块 (Cart Routes)
 * ==========================================
 * 处理购物车相关的接口：
 * - GET    /api/cart              获取当前用户的购物车
 * - POST   /api/cart/items        添加商品到购物车
 * - PUT    /api/cart/items/:id    更新购物车中某商品的数量
 * - DELETE /api/cart/items/:id    删除购物车中的某商品
 * - DELETE /api/cart              清空购物车
 */

'use strict';

const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { verifyToken } = require('../middleware/auth');
const { validate, cartSchemas } = require('../utils/validator');
const { success } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');

/**
 * 注册购物车路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function cartRoutes(fastify, options) {

  /**
   * GET /api/cart
   * 获取购物车 - 自动为用户创建购物车（如果不存在）
   */
  fastify.get('/', {
    onRequest: [verifyToken],
    schema: {
      description: '获取购物车',
      tags: ['购物车'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;

    let cart = await Cart.findOne({ user: userId }).lean();

    // 如果购物车不存在，自动创建
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
      cart = cart.toObject();
    }

    // 计算总金额和数量
    const totalAmount = cart.items
      .filter(item => item.checked)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalCount = cart.items
      .filter(item => item.checked)
      .reduce((sum, item) => sum + item.quantity, 0);
    const itemCount = cart.items.length;

    return success({
      data: {
        items: cart.items,
        totalAmount,
        totalCount,
        itemCount,
      },
      message: '获取购物车成功',
    });
  });

  /**
   * POST /api/cart/items
   * 添加商品到购物车
   * Body: { productId, quantity }
   */
  fastify.post('/items', {
    onRequest: [verifyToken],
    schema: {
      description: '添加商品到购物车',
      tags: ['购物车'],
      body: {
        type: 'object',
        required: ['productId'],
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'integer', default: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const data = validate(cartSchemas.addItem, request.body);

    // 1. 查询商品信息
    const product = await Product.findById(data.productId);
    if (!product) {
      throw new BusinessError(404001, '商品不存在', 404);
    }
    if (product.status !== 'on') {
      throw new BusinessError(400005, '该商品已下架', 400);
    }
    if (product.stock < data.quantity) {
      throw new BusinessError(400006, `库存不足，当前库存: ${product.stock}`, 400);
    }

    // 2. 查找或创建购物车
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    // 3. 检查商品是否已在购物车中
    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === data.productId
    );

    if (existingItemIndex >= 0) {
      // 已存在则累加数量
      cart.items[existingItemIndex].quantity += data.quantity;
    } else {
      // 不存在则添加新项
      cart.items.push({
        productId: product._id,
        name: product.name,
        image: product.image,
        price: product.price,
        specs: product.specs,
        quantity: data.quantity,
        checked: true,
        addedAt: new Date(),
      });
    }

    await cart.save();

    return success({
      data: {
        items: cart.items,
        totalAmount: cart.calculateTotal(),
        totalCount: cart.calculateCount(),
      },
      message: '商品已添加到购物车',
    });
  });

  /**
   * PUT /api/cart/items/:id
   * 更新购物车中某商品的数量
   * :id 是购物车项的 _id
   */
  fastify.put('/items/:id', {
    onRequest: [verifyToken],
    schema: {
      description: '更新购物车商品数量',
      tags: ['购物车'],
      body: {
        type: 'object',
        required: ['quantity'],
        properties: {
          quantity: { type: 'integer', description: '新数量' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const itemId = request.params.id;
    const data = validate(cartSchemas.updateQty, request.body);

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      throw new BusinessError(404006, '购物车不存在', 404);
    }

    // 查找购物车项
    const item = cart.items.id(itemId);
    if (!item) {
      throw new BusinessError(404007, '购物车中未找到该商品', 404);
    }

    // 校验库存
    const product = await Product.findById(item.productId);
    if (product && data.quantity > product.stock) {
      throw new BusinessError(400006, `库存不足，当前库存: ${product.stock}`, 400);
    }

    item.quantity = data.quantity;
    await cart.save();

    return success({
      data: {
        items: cart.items,
        totalAmount: cart.calculateTotal(),
        totalCount: cart.calculateCount(),
      },
      message: '购物车商品数量已更新',
    });
  });

  /**
   * DELETE /api/cart/items/:id
   * 删除购物车中的某商品
   */
  fastify.delete('/items/:id', {
    onRequest: [verifyToken],
    schema: {
      description: '删除购物车商品',
      tags: ['购物车'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const itemId = request.params.id;

    const cart = await Cart.findOneAndUpdate(
      { user: userId },
      { $pull: { items: { _id: itemId } } },
      { new: true }
    );

    if (!cart) {
      throw new BusinessError(404006, '购物车不存在', 404);
    }

    return success({
      data: {
        items: cart.items,
        totalAmount: cart.calculateTotal(),
        totalCount: cart.calculateCount(),
      },
      message: '商品已从购物车移除',
    });
  });

  /**
   * DELETE /api/cart
   * 清空购物车
   */
  fastify.delete('/', {
    onRequest: [verifyToken],
    schema: {
      description: '清空购物车',
      tags: ['购物车'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;

    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [] } },
      { new: true }
    );

    return success({
      data: { items: [], totalAmount: 0, totalCount: 0 },
      message: '购物车已清空',
    });
  });
}

module.exports = cartRoutes;
