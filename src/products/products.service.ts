import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Product } from './product.entity';
import { Category } from './category.entity';
import { CreateProductDto, CreateCategoryDto } from './dto/create-product.dto';

interface CategoryTreeNode {
  id: number;
  name: string;
  parent?: CategoryTreeNode;
  children: CategoryTreeNode[];
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  private readonly logger = new Logger(ProductsService.name);
  private static readonly searchCacheKeys = new Set<string>();

  private async invalidateSearchCache(): Promise<void> {
    for (const key of ProductsService.searchCacheKeys) {
      try {
        await this.cacheManager.del(key);
      } catch (error) {
        this.logger.warn(
          `Failed to invalidate cache key ${key}: ${(error as Error).message}`,
        );
      }
    }
    ProductsService.searchCacheKeys.clear();
  }

  async findAll(): Promise<Product[]> {
    return this.productsRepository.find({ relations: ['category'] });
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!product) {
      throw new NotFoundException(`Product #${id} not found`);
    }
    return product;
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const product = this.productsRepository.create(createProductDto);
    const saved = await this.productsRepository.save(product);
    await this.invalidateSearchCache();
    return saved;
  }

  async updateStock(id: number, quantity: number): Promise<Product> {
    const product = await this.findOne(id);
    product.stock = quantity;
    return this.productsRepository.save(product);
  }

  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    await this.productsRepository.remove(product);
    await this.invalidateSearchCache();
  }

  async searchProducts(query: string): Promise<Product[]> {
    const cacheKey = `product-search:${query.toLowerCase()}`;
    const cached = await this.cacheManager.get<Product[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const products = await this.productsRepository.find();
    const results = products.filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(query.toLowerCase()),
    );

    ProductsService.searchCacheKeys.add(cacheKey);
    await this.cacheManager.set(cacheKey, results, 60000);
    return results;
  }

  async findAllCategories(): Promise<Category[]> {
    return this.categoriesRepository.find({
      relations: ['parent', 'children'],
    });
  }

  async findCategory(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
      relations: ['parent', 'children', 'products'],
    });
    if (!category) {
      throw new NotFoundException(`Category #${id} not found`);
    }
    return category;
  }

  async createCategory(dto: CreateCategoryDto): Promise<Category> {
    const category = this.categoriesRepository.create(dto);
    return this.categoriesRepository.save(category);
  }

  async getCategoryTree(categoryId: number): Promise<any> {
    const category = await this.findCategory(categoryId);
    return this.buildCategoryTree(category, new Set<number>());
  }

  private static readonly MAX_CATEGORY_DEPTH = 100;

  private buildCategoryTree(
    category: Category,
    visited: Set<number>,
    depth = 0,
  ): CategoryTreeNode {
    const tree: CategoryTreeNode = {
      id: category.id,
      name: category.name,
      children: [],
    };
    visited.add(category.id);

    if (category.parentId) {
      const parentCycle = category.parent
        ? visited.has(category.parent.id)
        : false;
      if (
        category.parent &&
        !parentCycle &&
        depth < ProductsService.MAX_CATEGORY_DEPTH
      ) {
        tree.parent = this.buildCategoryTree(
          category.parent,
          visited,
          depth + 1,
        );
      } else if (!category.parent) {
        this.logger.warn(
          `Category #${category.id} has parentId=${category.parentId} but parent is not loaded; skipping`,
        );
      }
    }

    if (category.children && category.children.length > 0) {
      tree.children = category.children
        .filter((child) => !visited.has(child.id))
        .map((child) => this.buildCategoryTree(child, visited, depth + 1));
    }

    return tree;
  }

  async processProductBatch(productIds: number[]): Promise<{
    success: boolean;
    processed: number;
    failed: number;
    errors: { id: number; error: string }[];
  }> {
    let processed = 0;
    const errors: { id: number; error: string }[] = [];

    for (const id of productIds) {
      try {
        const product = await this.findOne(id);
        product.updatedAt = new Date();
        await this.productsRepository.save(product);
        processed++;
      } catch (error) {
        const message = (error as Error).message;
        errors.push({ id, error: message });
        this.logger.warn(`Failed to process product #${id}: ${message}`);
      }
    }

    return {
      success: errors.length === 0,
      processed,
      failed: errors.length,
      errors,
    };
  }
}
