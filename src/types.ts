export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  role: string;
}

export interface BusinessSettings {
  id: number;
  userId: number;
  businessName: string;
  city: string;
  currency: string;
  timezone: string;
  initialCapital: number;
  targetProfitPerUnit: number;
  reinvestmentPercent: number;
  costAllocationMethod: 'proportional' | 'equal';
  valuationMethod: 'weighted_average' | 'last_cost';
  ivaRate: number;
  taxDocumentType: string;
  rutEmpresa: string;
  updatedAt: string;
}

export interface Account {
  id: number;
  userId: number;
  name: string;
  type: 'banco' | 'efectivo' | 'digital';
  initialBalance: number;
  isDefault: boolean;
  createdAt: string;
}

export interface Supplier {
  id: number;
  userId: number;
  name: string;
  country: string;
  city: string;
  website: string;
  whatsapp: string;
  email: string;
  address: string;
  productsSupplied: string;
  minOrderQty: number;
  avgLeadDays: number;
  shippingCostEstimate: number;
  rating: number;
  notes: string;
  isExample: boolean;
  createdAt: string;
}

export interface ProductVariant {
  id: number;
  userId: number;
  productId: number;
  skuVariant: string;
  size: string;
  color: string;
  stock: number;
  reservedStock: number;
  minStock: number;
  unitCost: number;
  salePriceOverride: number | null;
  updatedAt: string;
}

export interface Product {
  id: number;
  userId: number;
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  supplierId: number | null;
  purchaseDate: string;
  purchasePrice: number;
  salePrice: number;
  location: string;
  mainPhoto: string;
  galleryPhotos: string[];
  isPack: boolean;
  packUnits: number;
  allowSingleUnitSale: boolean;
  packComposition: string;
  singleUnitSalePrice: number;
  isActive: boolean;
  isExample: boolean;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariant[];
}

export interface SaleItem {
  id: number;
  saleId: number;
  productId: number;
  variantId: number;
  productName: string;
  size: string;
  color: string;
  saleMode: 'unit' | 'pack';
  quantity: number;
  physicalUnitsDeducted: number;
  unitPrice: number;
  unitCostSnapshot: number;
  lineSubtotal: number;
  lineCogs: number;
  returnedQuantity: number;
}

export interface Sale {
  id: number;
  userId: number;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  customerPhone: string;
  channel: string;
  paymentMethod: string;
  paymentStatus: 'pagado' | 'pendiente' | 'parcial' | 'cancelado' | 'devuelto';
  accountId: number | null;
  subtotal: number;
  discount: number;
  shippingCost: number;
  commission: number;
  otherCost: number;
  total: number;
  totalCogs: number;
  estimatedProfit: number;
  amountPaid: number;
  notes: string;
  performedBy: string;
  isExample: boolean;
  createdAt: string;
  items: SaleItem[];
}

export interface PurchaseOrderItem {
  id: number;
  purchaseOrderId: number;
  productId: number;
  variantId: number;
  quantityOrdered: number;
  quantityReceived: number;
  isPackPurchase: boolean;
  unitsPerPack: number;
  unitPrice: number;
  allocatedExtraCostPerUnit: number;
  finalUnitCost: number;
}

export interface PurchaseOrder {
  id: number;
  userId: number;
  orderNumber: string;
  supplierId: number | null;
  orderDate: string;
  estimatedArrival: string;
  receivedDate: string;
  status:
    | 'pedido_creado'
    | 'pagado'
    | 'en_transito'
    | 'recibido_parcial'
    | 'recibido'
    | 'cancelado';
  subtotal: number;
  discount: number;
  shippingCost: number;
  taxes: number;
  otherCosts: number;
  total: number;
  costAllocationMethod: 'proportional' | 'equal';
  paymentMethod: string;
  accountId: number | null;
  isPaid: boolean;
  notes: string;
  isExample: boolean;
  createdAt: string;
  items: PurchaseOrderItem[];
}

export interface InventoryMovement {
  id: number;
  userId: number;
  productId: number;
  variantId: number;
  movementType: string;
  quantityChange: number;
  previousStock: number;
  newStock: number;
  unitCost: number;
  referenceType: string;
  referenceId: number | null;
  reason: string;
  performedBy: string;
  isExample: boolean;
  createdAt: string;
}

export interface Expense {
  id: number;
  userId: number;
  date: string;
  dueDate: string;
  expenseType: 'fijo' | 'variable';
  category: string;
  concept: string;
  amount: number;
  paymentMethod: string;
  accountId: number | null;
  isRecurring: boolean;
  recurringDay: number | null;
  status: 'pendiente' | 'pagado';
  paidDate: string;
  receiptRef: string;
  notes: string;
  isExample: boolean;
  createdAt: string;
}

export interface FinancialTransaction {
  id: number;
  userId: number;
  date: string;
  direction: 'ingreso' | 'egreso' | 'transferencia';
  classification:
    | 'cobro_venta'
    | 'aporte_capital'
    | 'otro_ingreso'
    | 'pago_proveedor'
    | 'gasto_fijo'
    | 'gasto_variable'
    | 'retiro_propietario'
    | 'transferencia_cuentas'
    | 'otro_egreso';
  category: string;
  concept: string;
  amount: number;
  paymentMethod: string;
  accountId: number | null;
  targetAccountId: number | null;
  referenceType: string;
  referenceId: number | null;
  receiptRef: string;
  notes: string;
  performedBy: string;
  isExample: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  userId: number;
  entity: string;
  entityId: number | null;
  action: string;
  summary: string;
  performedBy: string;
  createdAt: string;
}

export interface WorkspaceData {
  user: UserProfile;
  settings: BusinessSettings;
  accounts: Account[];
  suppliers: Supplier[];
  products: Product[];
  sales: Sale[];
  purchaseOrders: PurchaseOrder[];
  expenses: Expense[];
  transactions: FinancialTransaction[];
  movements: InventoryMovement[];
  auditLogs: AuditLog[];
}

export type NavSection =
  | 'dashboard'
  | 'inventory'
  | 'sales'
  | 'purchases'
  | 'cashflow'
  | 'expenses'
  | 'suppliers'
  | 'accounting'
  | 'reports'
  | 'settings';
