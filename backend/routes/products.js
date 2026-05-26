/**
 * ==========================================
 * 产品路由模块 (Product Routes)
 * ==========================================
 * 处理产品相关的接口：
 * - GET  /api/products              产品列表（支持筛选/搜索/排序/分页）
 * - GET  /api/products/:id          产品详情
 * - GET  /api/products/categories   分类列表
 * - POST /api/products              创建产品（管理员）
 * - PUT  /api/products/:id          更新产品（管理员）
 * - DELETE /api/products/:id        删除产品（管理员）
 */

'use strict';

const productService = require('../services/productService');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate, productSchemas } = require('../utils/validator');
const { success, paginated } = require('../utils/response');

/**
 * 注册产品路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function productRoutes(fastify, options) {

  /**
   * GET /api/products
   * 获取产品列表 - 公开接口，支持多种查询参数
   * Query: page, limit, cat(分类ID), q(关键词), sort(排序)
   */
  fastify.get('/', {
    schema: {
      description: '获取产品列表',
      tags: ['产品'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
          cat: { type: 'string', default: '' },
          q: { type: 'string', default: '' },
          sort: { type: 'string', default: 'newest' },
        },
      },
    },
  }, async (request, reply) => {
    const params = validate(productSchemas.listQuery, request.query);
    const result = await productService.getProductList(params);
    return paginated(result);
  });

  /**
   * GET /api/products/categories
   * 获取分类列表 - 公开接口，返回嵌套分类树
   */
  fastify.get('/categories', {
    schema: {
      description: '获取产品分类列表',
      tags: ['产品'],
    },
  }, async (request, reply) => {
    const categories = await productService.getCategoryList();
    return success({ data: categories, message: '获取分类列表成功' });
  });

  /**
   * GET /api/products/:id
   * 获取产品详情 - 公开接口
   */
  fastify.get('/:id', {
    schema: {
      description: '获取产品详情',
      tags: ['产品'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: '产品ID' },
        },
      },
    },
  }, async (request, reply) => {
    const product = await productService.getProductDetail(request.params.id);
    return success({ data: product, message: '获取产品详情成功' });
  });

  // ========== 以下接口需要管理员权限 ==========

  /**
   * POST /api/products
   * 创建产品 - 仅管理员可访问
   */
  fastify.post('/', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '创建产品（管理员）',
      tags: ['产品'],
      body: {
        type: 'object',
        required: ['name', 'price', 'category'],
        properties: {
          name: { type: 'string' },
          subtitle: { type: 'string' },
          description: { type: 'string' },
          image: { type: 'string' },
          gallery: { type: 'array', items: { type: 'string' } },
          category: { type: 'string' },
          price: { type: 'number' },
          originalPrice: { type: 'number' },
          stock: { type: 'number' },
          specs: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          origin: { type: 'string' },
          isRecommended: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const data = validate(productSchemas.create, request.body);
    const product = await productService.createProduct(data);
    return success({ data: product, message: '产品创建成功' });
  });

  /**
   * PUT /api/products/:id
   * 更新产品 - 仅管理员可访问
   */
  fastify.put('/:id', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '更新产品（管理员）',
      tags: ['产品'],
    },
  }, async (request, reply) => {
    const data = validate(productSchemas.update, request.body);
    const product = await productService.updateProduct(request.params.id, data);
    return success({ data: product, message: '产品更新成功' });
  });

  /**
   * DELETE /api/products/:id
   * 删除产品 - 仅管理员可访问
   */
  fastify.delete('/:id', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '删除产品（管理员）',
      tags: ['产品'],
    },
  }, async (request, reply) => {
    await productService.deleteProduct(request.params.id);
    return success({ data: null, message: '产品删除成功' });
  });
}

module.exports = productRoutes;
