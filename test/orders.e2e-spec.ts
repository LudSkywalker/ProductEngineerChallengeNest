import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CACHE_MANAGER, CACHE_MODULE_OPTIONS } from '@nestjs/cache-manager';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Order } from '../src/orders/order.entity';
import { OrderItem } from '../src/orders/order-item.entity';
import { Product } from '../src/products/product.entity';
import { User } from '../src/users/user.entity';
import { ensureTestDatabase } from './ensure-test-db';
import { createInMemoryCache } from './in-memory-cache';

interface CreatedResource {
  id: number;
}

interface CreateOrderResponse {
  id: number;
  status: string;
  userId: number;
  total: string | number;
  items: Array<{
    productId: number;
    quantity: number;
  }>;
}

interface FullOrderResponse {
  id: number;
  status: string;
  total: string | number;
  user: {
    id: number;
    name: string;
    email: string;
  };
  items: Array<{
    quantity: number;
    product: {
      id: number;
      name: string;
    };
  }>;
}

interface ErrorResponse {
  message: string;
}

function bodyOf<T>(response: { body: unknown }): T {
  return response.body as T;
}

describe('Orders API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const runId = Date.now();
  const userEmail = `e2e-orders-${runId}@example.com`;
  const userName = 'E2E Orders Tester';
  const productName = `E2E Product ${runId}`;
  const price = 10;
  const initialStock = 5;
  const orderedQuantity = 2;

  let userId: number;
  let productId: number;
  let orderId: number;

  beforeAll(async () => {
    await ensureTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CACHE_MANAGER)
      .useValue(createInMemoryCache())
      .overrideProvider(CACHE_MODULE_OPTIONS)
      .useValue({ ttl: 60000 })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);

    const userResponse = await request(app.getHttpServer())
      .post('/users')
      .send({ email: userEmail, name: userName })
      .expect(201);
    userId = bodyOf<CreatedResource>(userResponse).id;

    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .send({ name: productName, price, stock: initialStock })
      .expect(201);
    productId = bodyOf<CreatedResource>(productResponse).id;
  });

  afterAll(async () => {
    if (dataSource) {
      if (productId) {
        await dataSource.getRepository(OrderItem).delete({ productId });
      }
      if (userId) {
        await dataSource.getRepository(Order).delete({ userId });
        await dataSource.getRepository(User).delete(userId);
      }
    }
    if (app && productId) {
      await request(app.getHttpServer()).delete(`/products/${productId}`);
    }
    if (app) {
      await app.close();
    }
  });

  it('POST /orders crea el pedido, calcula el total y descuenta el stock', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({ userId, items: [{ productId, quantity: orderedQuantity }] })
      .expect(201);

    const order = bodyOf<CreateOrderResponse>(response);
    orderId = order.id;

    expect(order.status).toBe('pending');
    expect(order.userId).toBe(userId);
    expect(Number(order.total)).toBeCloseTo(price * orderedQuantity);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      productId,
      quantity: orderedQuantity,
    });

    const product = (await dataSource
      .getRepository(Product)
      .findOneBy({ id: productId }))!;
    expect(product.stock).toBe(initialStock - orderedQuantity);

    const persistedOrder = (await dataSource
      .getRepository(Order)
      .findOneBy({ id: orderId }))!;
    expect(Number(persistedOrder.total)).toBeCloseTo(price * orderedQuantity);
    expect(persistedOrder.status).toBe('pending');
  });

  it('POST /orders sin stock suficiente responde 400 y no deja datos parciales', async () => {
    const orderItemRepository = dataSource.getRepository(OrderItem);
    const orderRepository = dataSource.getRepository(Order);

    const itemsBefore = await orderItemRepository.countBy({ productId });
    const ordersBefore = await orderRepository.countBy({ userId });
    const productBefore = (await dataSource
      .getRepository(Product)
      .findOneBy({ id: productId }))!;

    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({ userId, items: [{ productId, quantity: initialStock * 2 }] })
      .expect(400);

    expect(bodyOf<ErrorResponse>(response).message).toBe(
      `Not enough stock for ${productName}`,
    );

    expect(await orderItemRepository.countBy({ productId })).toBe(itemsBefore);
    expect(await orderRepository.countBy({ userId })).toBe(ordersBefore);

    const productAfter = (await dataSource
      .getRepository(Product)
      .findOneBy({ id: productId }))!;
    expect(productAfter.stock).toBe(productBefore.stock);
  });

  it('POST /orders con usuario o producto inexistente responde 404 sin crear pedidos', async () => {
    const orderRepository = dataSource.getRepository(Order);
    const ordersBefore = await orderRepository.countBy({ userId });

    await request(app.getHttpServer())
      .post('/orders')
      .send({ userId: -1, items: [{ productId, quantity: 1 }] })
      .expect(404);

    await request(app.getHttpServer())
      .post('/orders')
      .send({ userId, items: [{ productId: 999999999, quantity: 1 }] })
      .expect(404);

    expect(await orderRepository.countBy({ userId })).toBe(ordersBefore);
  });

  it('GET /orders/:id/full devuelve el DTO plano con usuario, items y producto', async () => {
    const response = await request(app.getHttpServer())
      .get(`/orders/${orderId}/full`)
      .expect(200);

    const fullOrder = bodyOf<FullOrderResponse>(response);
    expect(fullOrder.id).toBe(orderId);
    expect(fullOrder.status).toBe('pending');
    expect(Number(fullOrder.total)).toBeCloseTo(price * orderedQuantity);
    expect(fullOrder.user).toEqual({
      id: userId,
      name: userName,
      email: userEmail,
    });
    expect(fullOrder.items).toHaveLength(1);
    expect(fullOrder.items[0]).toMatchObject({
      quantity: orderedQuantity,
      product: {
        id: productId,
        name: productName,
      },
    });
  });
});
