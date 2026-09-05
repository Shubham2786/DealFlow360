import { z } from 'zod';
import { CustomerSegment, ProductType, UserRole } from './enums';

// ---- Auth ----
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.nativeEnum(UserRole).optional(),
});
export type SignupInput = z.infer<typeof SignupSchema>;

// ---- Customers ----
export const CreateCustomerSchema = z.object({
  name: z.string().min(1),
  segment: z.nativeEnum(CustomerSegment).default(CustomerSegment.STANDARD),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

// ---- Products ----
export const CreateProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  type: z.nativeEnum(ProductType).default(ProductType.ONE_TIME),
  basePrice: z.number().nonnegative(),
  currency: z.string().default('USD'),
  uom: z.string().default('unit'),
  taxRate: z.number().min(0).max(100).default(0),
  active: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

// ---- Common ----
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}
