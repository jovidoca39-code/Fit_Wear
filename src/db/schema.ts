import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').default(''),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const businessSettings = pgTable('business_settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  businessName: text('business_name').notNull().default('DUNA ACTIVE'),
  city: text('city').notNull().default('Antofagasta, Chile'),
  currency: text('currency').notNull().default('CLP'),
  timezone: text('timezone').notNull().default('America/Santiago'),
  initialCapital: doublePrecision('initial_capital').notNull().default(116724),
  targetProfitPerUnit: doublePrecision('target_profit_per_unit').notNull().default(10000),
  reinvestmentPercent: doublePrecision('reinvestment_percent').notNull().default(70),
  costAllocationMethod: text('cost_allocation_method').notNull().default('proportional'),
  valuationMethod: text('valuation_method').notNull().default('weighted_average'),
  ivaRate: doublePrecision('iva_rate').notNull().default(19),
  taxDocumentType: text('tax_document_type').notNull().default('Boleta Electrónica'),
  rutEmpresa: text('rut_empresa').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  type: text('type').notNull().default('banco'),
  initialBalance: doublePrecision('initial_balance').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  country: text('country').notNull().default('Chile'),
  city: text('city').notNull().default(''),
  website: text('website').notNull().default(''),
  whatsapp: text('whatsapp').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  productsSupplied: text('products_supplied').notNull().default(''),
  minOrderQty: integer('min_order_qty').notNull().default(1),
  avgLeadDays: integer('avg_lead_days').notNull().default(7),
  shippingCostEstimate: doublePrecision('shipping_cost_estimate').notNull().default(0),
  rating: integer('rating').notNull().default(5),
  notes: text('notes').notNull().default(''),
  isExample: boolean('is_example').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull().default('Calzas'),
  brand: text('brand').notNull().default(''),
  model: text('model').notNull().default(''),
  description: text('description').notNull().default(''),
  supplierId: integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  purchaseDate: text('purchase_date').notNull().default(''),
  purchasePrice: doublePrecision('purchase_price').notNull().default(0),
  salePrice: doublePrecision('sale_price').notNull().default(0),
  location: text('location').notNull().default('Bodega Antofagasta'),
  mainPhoto: text('main_photo').notNull().default(''),
  galleryPhotos: jsonb('gallery_photos').$type<string[]>().notNull().default([]),
  isPack: boolean('is_pack').notNull().default(false),
  packUnits: integer('pack_units').notNull().default(1),
  allowSingleUnitSale: boolean('allow_single_unit_sale').notNull().default(false),
  packComposition: text('pack_composition').notNull().default(''),
  singleUnitSalePrice: doublePrecision('single_unit_sale_price').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  isExample: boolean('is_example').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productVariants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  skuVariant: text('sku_variant').notNull(),
  size: text('size').notNull(),
  color: text('color').notNull(),
  stock: integer('stock').notNull().default(0),
  reservedStock: integer('reserved_stock').notNull().default(0),
  minStock: integer('min_stock').notNull().default(2),
  unitCost: doublePrecision('unit_cost').notNull().default(0),
  salePriceOverride: doublePrecision('sale_price_override'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  orderNumber: text('order_number').notNull(),
  supplierId: integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  orderDate: text('order_date').notNull(),
  estimatedArrival: text('estimated_arrival').notNull().default(''),
  receivedDate: text('received_date').notNull().default(''),
  status: text('status').notNull().default('pedido_creado'),
  subtotal: doublePrecision('subtotal').notNull().default(0),
  discount: doublePrecision('discount').notNull().default(0),
  shippingCost: doublePrecision('shipping_cost').notNull().default(0),
  taxes: doublePrecision('taxes').notNull().default(0),
  otherCosts: doublePrecision('other_costs').notNull().default(0),
  total: doublePrecision('total').notNull().default(0),
  costAllocationMethod: text('cost_allocation_method').notNull().default('proportional'),
  paymentMethod: text('payment_method').notNull().default('Transferencia'),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  isPaid: boolean('is_paid').notNull().default(false),
  notes: text('notes').notNull().default(''),
  isExample: boolean('is_example').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  purchaseOrderId: integer('purchase_order_id')
    .references(() => purchaseOrders.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  variantId: integer('variant_id')
    .references(() => productVariants.id, { onDelete: 'cascade' })
    .notNull(),
  quantityOrdered: integer('quantity_ordered').notNull(),
  quantityReceived: integer('quantity_received').notNull().default(0),
  isPackPurchase: boolean('is_pack_purchase').notNull().default(false),
  unitsPerPack: integer('units_per_pack').notNull().default(1),
  unitPrice: doublePrecision('unit_price').notNull(),
  allocatedExtraCostPerUnit: doublePrecision('allocated_extra_cost_per_unit').notNull().default(0),
  finalUnitCost: doublePrecision('final_unit_cost').notNull().default(0),
});

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  saleNumber: text('sale_number').notNull(),
  saleDate: text('sale_date').notNull(),
  customerName: text('customer_name').notNull().default(''),
  customerPhone: text('customer_phone').notNull().default(''),
  channel: text('channel').notNull().default('Instagram'),
  paymentMethod: text('payment_method').notNull().default('Transferencia'),
  paymentStatus: text('payment_status').notNull().default('pagado'),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  subtotal: doublePrecision('subtotal').notNull().default(0),
  discount: doublePrecision('discount').notNull().default(0),
  shippingCost: doublePrecision('shipping_cost').notNull().default(0),
  commission: doublePrecision('commission').notNull().default(0),
  otherCost: doublePrecision('other_cost').notNull().default(0),
  total: doublePrecision('total').notNull().default(0),
  totalCogs: doublePrecision('total_cogs').notNull().default(0),
  estimatedProfit: doublePrecision('estimated_profit').notNull().default(0),
  amountPaid: doublePrecision('amount_paid').notNull().default(0),
  notes: text('notes').notNull().default(''),
  performedBy: text('performed_by').notNull().default(''),
  isExample: boolean('is_example').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const saleItems = pgTable('sale_items', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .references(() => sales.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  variantId: integer('variant_id')
    .references(() => productVariants.id, { onDelete: 'cascade' })
    .notNull(),
  productName: text('product_name').notNull(),
  size: text('size').notNull(),
  color: text('color').notNull(),
  saleMode: text('sale_mode').notNull().default('unit'),
  quantity: integer('quantity').notNull(),
  physicalUnitsDeducted: integer('physical_units_deducted').notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
  unitCostSnapshot: doublePrecision('unit_cost_snapshot').notNull(),
  lineSubtotal: doublePrecision('line_subtotal').notNull(),
  lineCogs: doublePrecision('line_cogs').notNull(),
  returnedQuantity: integer('returned_quantity').notNull().default(0),
});

export const inventoryMovements = pgTable('inventory_movements', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  variantId: integer('variant_id')
    .references(() => productVariants.id, { onDelete: 'cascade' })
    .notNull(),
  movementType: text('movement_type').notNull(),
  quantityChange: integer('quantity_change').notNull(),
  previousStock: integer('previous_stock').notNull(),
  newStock: integer('new_stock').notNull(),
  unitCost: doublePrecision('unit_cost').notNull().default(0),
  referenceType: text('reference_type').notNull().default('manual'),
  referenceId: integer('reference_id'),
  reason: text('reason').notNull().default(''),
  performedBy: text('performed_by').notNull().default(''),
  isExample: boolean('is_example').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  date: text('date').notNull(),
  dueDate: text('due_date').notNull().default(''),
  expenseType: text('expense_type').notNull().default('variable'),
  category: text('category').notNull(),
  concept: text('concept').notNull(),
  amount: doublePrecision('amount').notNull(),
  paymentMethod: text('payment_method').notNull().default('Transferencia'),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  isRecurring: boolean('is_recurring').notNull().default(false),
  recurringDay: integer('recurring_day'),
  status: text('status').notNull().default('pendiente'),
  paidDate: text('paid_date').notNull().default(''),
  receiptRef: text('receipt_ref').notNull().default(''),
  notes: text('notes').notNull().default(''),
  isExample: boolean('is_example').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const financialTransactions = pgTable('financial_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  date: text('date').notNull(),
  direction: text('direction').notNull(),
  classification: text('classification').notNull(),
  category: text('category').notNull(),
  concept: text('concept').notNull(),
  amount: doublePrecision('amount').notNull(),
  paymentMethod: text('payment_method').notNull().default('Transferencia'),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  targetAccountId: integer('target_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  referenceType: text('reference_type').notNull().default('manual'),
  referenceId: integer('reference_id'),
  receiptRef: text('receipt_ref').notNull().default(''),
  notes: text('notes').notNull().default(''),
  performedBy: text('performed_by').notNull().default(''),
  isExample: boolean('is_example').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  action: text('action').notNull(),
  summary: text('summary').notNull(),
  performedBy: text('performed_by').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(businessSettings, {
    fields: [users.id],
    references: [businessSettings.userId],
  }),
  accounts: many(accounts),
  suppliers: many(suppliers),
  products: many(products),
  sales: many(sales),
  purchaseOrders: many(purchaseOrders),
  expenses: many(expenses),
  financialTransactions: many(financialTransactions),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [products.supplierId],
    references: [suppliers.id],
  }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export const salesRelations = relations(sales, ({ many }) => ({
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchaseOrders.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));
