import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from '../products/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UsersService } from '../users/users.service';
import { ProductsService } from '../products/products.service';

const paymentService = {
  async processPayment(
    orderId: number,
    amount: number,
  ): Promise<{ success: boolean; transactionId: string }> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (Math.random() < 0.1) {
      throw new Error(
        `Payment service unavailable (order ${orderId}, amount ${amount})`,
      );
    }

    return { success: true, transactionId: `TXN-${Date.now()}` };
  },
};

@Injectable()
export class OrdersService {
  private maxRetries = 3;

  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private usersService: UsersService,
    private productsService: ProductsService,
  ) {}

  async findAll(): Promise<Order[]> {
    return this.ordersRepository.find({
      relations: ['user', 'items', 'items.product'],
    });
  }

  async findOne(id: number): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['user', 'items', 'items.product'],
    });
    if (!order) {
      throw new NotFoundException(`Order #${id} not found`);
    }
    return order;
  }

  async findByUser(userId: number): Promise<Order[]> {
    return this.ordersRepository.find({
      where: { userId },
      relations: ['items', 'items.product'],
    });
  }

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    const user = await this.usersService.findOne(createOrderDto.userId);

    return this.ordersRepository.manager.transaction(async (manager) => {
      const order = manager.create(Order, {
        userId: user.id,
        status: OrderStatus.PENDING,
        total: 0,
      });
      const savedOrder = await manager.save(order);

      let total = 0;
      for (const itemDto of createOrderDto.items) {
        const product = await manager.findOne(Product, {
          where: { id: itemDto.productId },
        });
        if (!product) {
          throw new NotFoundException(
            `Product #${itemDto.productId} not found`,
          );
        }

        const result = await manager
          .createQueryBuilder()
          .update(Product)
          .set({ stock: () => 'stock - :qty' })
          .where('id = :id AND stock >= :qty', {
            id: product.id,
            qty: itemDto.quantity,
          })
          .execute();

        if (result.affected !== 1) {
          throw new BadRequestException(`Not enough stock for ${product.name}`);
        }

        const orderItem = manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: product.id,
          quantity: itemDto.quantity,
          price: product.price,
        });
        await manager.save(orderItem);

        total += Number(product.price) * itemDto.quantity;
      }

      savedOrder.total = total;
      await manager.save(savedOrder);

      const finalOrder = await manager.findOne(Order, {
        where: { id: savedOrder.id },
        relations: ['user', 'items', 'items.product'],
      });
      if (!finalOrder) {
        throw new NotFoundException(`Order #${savedOrder.id} not found`);
      }
      return finalOrder;
    });
  }

  async updateStatus(id: number, status: OrderStatus): Promise<Order> {
    const order = await this.findOne(id);
    order.status = status;
    return this.ordersRepository.save(order);
  }

  async processPayment(
    orderId: number,
  ): Promise<{ success: boolean; transactionId: string }> {
    const order = await this.findOne(orderId);

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await paymentService.processPayment(
          orderId,
          Number(order.total),
        );

        if (result.success) {
          order.status = OrderStatus.CONFIRMED;
          await this.ordersRepository.save(order);
          return result;
        }
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    throw new ServiceUnavailableException(
      `Payment failed after ${this.maxRetries} attempts: ${
        lastError?.message ?? 'unknown error'
      }`,
    );
  }

  async cancel(id: number): Promise<Order> {
    const order = await this.findOne(id);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }

    for (const item of order.items) {
      const product = await this.productsService.findOne(item.productId);
      await this.productsService.updateStock(
        product.id,
        product.stock + item.quantity,
      );
    }

    order.status = OrderStatus.CANCELLED;
    return this.ordersRepository.save(order);
  }

  async getOrderWithFullDetails(id: number): Promise<any> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['user', 'items', 'items.product', 'items.product.category'],
    });

    if (!order) {
      throw new NotFoundException(`Order #${id} not found`);
    }

    return {
      id: order.id,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      user: {
        id: order.user.id,
        name: order.user.name,
        email: order.user.email,
      },
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
        product: {
          id: item.product.id,
          name: item.product.name,
          ...(item.product.category
            ? { category: item.product.category.name }
            : {}),
        },
      })),
    };
  }
}
