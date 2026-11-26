import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  accounts,
  auditLogs,
  businessSettings,
  expenses,
  financialTransactions,
  inventoryMovements,
  products,
  productVariants,
  purchaseOrderItems,
  purchaseOrders,
  saleItems,
  sales,
  suppliers,
} from '../db/schema.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';

export const apiRouter = Router();

apiRouter.use(requireAuth);

function todayChile(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function sanitizeImageUrl(url: string | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('/src/assets/images/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/jpeg;base64,') ||
    trimmed.startsWith('data:image/png;base64,') ||
    trimmed.startsWith('data:image/webp;base64,')
  ) {
    // Limit base64 photo payload to ~4MB
    if (trimmed.startsWith('data:image/') && trimmed.length > 5_500_000) {
      throw new Error('La imagen excede el tamaño máximo permitido (4 MB).');
    }
    return trimmed;
  }
  return '';
}

function generateSku(name: string, category: string): string {
  const catCode = (category || 'PRD')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
  const nameCode = (name || 'ITEM')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
  const suffix = Math.floor(100 + Math.random() * 900);
  return `DUNA-${catCode || 'FIT'}-${nameCode || 'PRO'}-${suffix}`;
}

function generateVariantSku(baseSku: string, color: string, size: string): string {
  const col = color
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
  const sz = size.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${baseSku}-${col || 'CLR'}-${sz || 'U'}`;
}

async function logAudit(
  tx: any,
  userId: number,
  entity: string,
  entityId: number | null,
  action: string,
  summary: string,
  performedBy: string,
) {
  await tx.insert(auditLogs).values({
    userId,
    entity,
    entityId,
    action,
    summary,
    performedBy,
  });
}

// =============================================================================
// 1. BOOTSTRAP SNAPSHOT
// =============================================================================
apiRouter.get('/bootstrap', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [
      settingsRows,
      accountRows,
      supplierRows,
      productRows,
      variantRows,
      saleRows,
      saleItemRows,
      poRows,
      poItemRows,
      expenseRows,
      txRows,
      movementRows,
      auditRows,
    ] = await Promise.all([
      db.select().from(businessSettings).where(eq(businessSettings.userId, userId)),
      db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.id),
      db.select().from(suppliers).where(eq(suppliers.userId, userId)).orderBy(suppliers.name),
      db.select().from(products).where(eq(products.userId, userId)).orderBy(desc(products.createdAt)),
      db.select().from(productVariants).where(eq(productVariants.userId, userId)).orderBy(productVariants.id),
      db.select().from(sales).where(eq(sales.userId, userId)).orderBy(desc(sales.saleDate), desc(sales.id)),
      db
        .select({ item: saleItems })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .where(eq(sales.userId, userId)),
      db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.userId, userId))
        .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.id)),
      db
        .select({ item: purchaseOrderItems })
        .from(purchaseOrderItems)
        .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
        .where(eq(purchaseOrders.userId, userId)),
      db
        .select()
        .from(expenses)
        .where(eq(expenses.userId, userId))
        .orderBy(desc(expenses.date), desc(expenses.id)),
      db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.userId, userId))
        .orderBy(desc(financialTransactions.date), desc(financialTransactions.id)),
      db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.userId, userId))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(500),
      db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, userId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(200),
    ]);

    const variantsByProduct = new Map<number, typeof variantRows>();
    for (const v of variantRows) {
      const list = variantsByProduct.get(v.productId) || [];
      list.push(v);
      variantsByProduct.set(v.productId, list);
    }

    const itemsBySale = new Map<number, (typeof saleItemRows)[number]['item'][]>();
    for (const row of saleItemRows) {
      const list = itemsBySale.get(row.item.saleId) || [];
      list.push(row.item);
      itemsBySale.set(row.item.saleId, list);
    }

    const itemsByPo = new Map<number, (typeof poItemRows)[number]['item'][]>();
    for (const row of poItemRows) {
      const list = itemsByPo.get(row.item.purchaseOrderId) || [];
      list.push(row.item);
      itemsByPo.set(row.item.purchaseOrderId, list);
    }

    res.json({
      user: req.dbUser,
      settings: settingsRows[0] || null,
      accounts: accountRows,
      suppliers: supplierRows,
      products: productRows.map((p) => ({
        ...p,
        variants: variantsByProduct.get(p.id) || [],
      })),
      sales: saleRows.map((s) => ({
        ...s,
        items: itemsBySale.get(s.id) || [],
      })),
      purchaseOrders: poRows.map((po) => ({
        ...po,
        items: itemsByPo.get(po.id) || [],
      })),
      expenses: expenseRows,
      transactions: txRows,
      movements: movementRows,
      auditLogs: auditRows,
    });
  } catch (error) {
    console.error('Error in GET /api/bootstrap:', error);
    res.status(500).json({ error: 'No se pudieron cargar los datos del negocio.' });
  }
});

// =============================================================================
// 2. PRODUCTS & INVENTORY
// =============================================================================
const variantInputSchema = z.object({
  id: z.number().optional(),
  size: z.string().min(1),
  color: z.string().min(1),
  stock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(2),
  unitCost: z.number().min(0).optional(),
  salePriceOverride: z.number().min(0).nullable().optional(),
});

const productInputSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1, 'El nombre del producto es obligatorio'),
  category: z.string().min(1).default('Calzas'),
  brand: z.string().default(''),
  model: z.string().default(''),
  description: z.string().default(''),
  supplierId: z.number().int().nullable().optional(),
  purchaseDate: z.string().default(''),
  purchasePrice: z.number().min(0),
  salePrice: z.number().min(0),
  location: z.string().default('Bodega Antofagasta'),
  mainPhoto: z.string().default(''),
  galleryPhotos: z.array(z.string()).default([]),
  isPack: z.boolean().default(false),
  packUnits: z.number().int().min(1).default(1),
  allowSingleUnitSale: z.boolean().default(false),
  packComposition: z.string().default(''),
  singleUnitSalePrice: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
  isExample: z.boolean().default(false),
  variants: z.array(variantInputSchema).min(1, 'Agrega al menos una variante de talla y color'),
});

apiRouter.post('/products', async (req: AuthRequest, res) => {
  try {
    const parsed = productInputSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const sku = parsed.sku?.trim() || generateSku(parsed.name, parsed.category);
    const mainPhoto = sanitizeImageUrl(parsed.mainPhoto);
    const galleryPhotos = parsed.galleryPhotos.map((u) => sanitizeImageUrl(u)).filter(Boolean);
    const packUnits = parsed.isPack ? Math.max(2, parsed.packUnits) : 1;
    const defaultPhysicalUnitCost = parsed.purchasePrice / packUnits;

    const created = await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          userId,
          sku,
          name: parsed.name.trim(),
          category: parsed.category,
          brand: parsed.brand.trim(),
          model: parsed.model.trim(),
          description: parsed.description.trim(),
          supplierId: parsed.supplierId ?? null,
          purchaseDate: parsed.purchaseDate || todayChile(),
          purchasePrice: parsed.purchasePrice,
          salePrice: parsed.salePrice,
          location: parsed.location.trim() || 'Bodega Antofagasta',
          mainPhoto,
          galleryPhotos,
          isPack: parsed.isPack,
          packUnits,
          allowSingleUnitSale: parsed.isPack ? parsed.allowSingleUnitSale : true,
          packComposition: parsed.packComposition.trim(),
          singleUnitSalePrice: parsed.isPack
            ? parsed.singleUnitSalePrice || Math.round(parsed.salePrice / packUnits)
            : parsed.salePrice,
          isActive: parsed.isActive,
          isExample: parsed.isExample,
        })
        .returning();

      const createdVariants = [];
      for (const v of parsed.variants) {
        const unitCost = v.unitCost !== undefined && v.unitCost > 0 ? v.unitCost : defaultPhysicalUnitCost;
        const [variant] = await tx
          .insert(productVariants)
          .values({
            userId,
            productId: product.id,
            skuVariant: generateVariantSku(sku, v.color, v.size),
            size: v.size.trim(),
            color: v.color.trim(),
            stock: v.stock,
            reservedStock: 0,
            minStock: v.minStock,
            unitCost,
            salePriceOverride: v.salePriceOverride ?? null,
          })
          .returning();

        createdVariants.push(variant);

        if (v.stock > 0) {
          await tx.insert(inventoryMovements).values({
            userId,
            productId: product.id,
            variantId: variant.id,
            movementType: 'stock_inicial',
            quantityChange: v.stock,
            previousStock: 0,
            newStock: v.stock,
            unitCost,
            referenceType: 'manual',
            referenceId: product.id,
            reason: `Stock inicial al registrar ${product.name} (${v.color} / ${v.size})`,
            performedBy: email,
            isExample: parsed.isExample,
          });
        }
      }

      await logAudit(tx, userId, 'product', product.id, 'create', `Producto creado: ${product.name} (${sku})`, email);
      return { ...product, variants: createdVariants };
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Datos inválidos' });
    }
    console.error('Error creating product:', error);
    res.status(500).json({ error: error.message || 'No se pudo registrar el producto.' });
  }
});

apiRouter.put('/products/:id', async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: 'ID inválido' });
    const parsed = productInputSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const existing = await db
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.userId, userId)));
    if (existing.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });

    const mainPhoto = sanitizeImageUrl(parsed.mainPhoto);
    const galleryPhotos = parsed.galleryPhotos.map((u) => sanitizeImageUrl(u)).filter(Boolean);
    const packUnits = parsed.isPack ? Math.max(2, parsed.packUnits) : 1;
    const defaultPhysicalUnitCost = parsed.purchasePrice / packUnits;
    const sku = parsed.sku?.trim() || existing[0].sku;

    const updated = await db.transaction(async (tx) => {
      const [prod] = await tx
        .update(products)
        .set({
          sku,
          name: parsed.name.trim(),
          category: parsed.category,
          brand: parsed.brand.trim(),
          model: parsed.model.trim(),
          description: parsed.description.trim(),
          supplierId: parsed.supplierId ?? null,
          purchaseDate: parsed.purchaseDate || existing[0].purchaseDate,
          purchasePrice: parsed.purchasePrice,
          salePrice: parsed.salePrice,
          location: parsed.location.trim() || 'Bodega Antofagasta',
          mainPhoto,
          galleryPhotos,
          isPack: parsed.isPack,
          packUnits,
          allowSingleUnitSale: parsed.isPack ? parsed.allowSingleUnitSale : true,
          packComposition: parsed.packComposition.trim(),
          singleUnitSalePrice: parsed.isPack
            ? parsed.singleUnitSalePrice || Math.round(parsed.salePrice / packUnits)
            : parsed.salePrice,
          isActive: parsed.isActive,
          isExample: parsed.isExample,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, productId), eq(products.userId, userId)))
        .returning();

      const currentVariants = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.productId, productId), eq(productVariants.userId, userId)));
      const currentMap = new Map(currentVariants.map((v) => [v.id, v]));

      const updatedVariants = [];
      for (const v of parsed.variants) {
        const unitCost = v.unitCost !== undefined && v.unitCost > 0 ? v.unitCost : defaultPhysicalUnitCost;
        if (v.id && currentMap.has(v.id)) {
          const prev = currentMap.get(v.id)!;
          const [updV] = await tx
            .update(productVariants)
            .set({
              size: v.size.trim(),
              color: v.color.trim(),
              stock: v.stock,
              minStock: v.minStock,
              unitCost,
              salePriceOverride: v.salePriceOverride ?? null,
              updatedAt: new Date(),
            })
            .where(and(eq(productVariants.id, v.id), eq(productVariants.userId, userId)))
            .returning();
          updatedVariants.push(updV);

          if (prev.stock !== v.stock) {
            await tx.insert(inventoryMovements).values({
              userId,
              productId,
              variantId: v.id,
              movementType: 'ajuste_manual',
              quantityChange: v.stock - prev.stock,
              previousStock: prev.stock,
              newStock: v.stock,
              unitCost,
              referenceType: 'manual',
              referenceId: productId,
              reason: `Edición de variante ${v.color} / ${v.size}`,
              performedBy: email,
              isExample: parsed.isExample,
            });
          }
        } else {
          const [newV] = await tx
            .insert(productVariants)
            .values({
              userId,
              productId,
              skuVariant: generateVariantSku(sku, v.color, v.size),
              size: v.size.trim(),
              color: v.color.trim(),
              stock: v.stock,
              reservedStock: 0,
              minStock: v.minStock,
              unitCost,
              salePriceOverride: v.salePriceOverride ?? null,
            })
            .returning();
          updatedVariants.push(newV);

          if (v.stock > 0) {
            await tx.insert(inventoryMovements).values({
              userId,
              productId,
              variantId: newV.id,
              movementType: 'stock_inicial',
              quantityChange: v.stock,
              previousStock: 0,
              newStock: v.stock,
              unitCost,
              referenceType: 'manual',
              referenceId: productId,
              reason: `Nueva variante agregada: ${v.color} / ${v.size}`,
              performedBy: email,
              isExample: parsed.isExample,
            });
          }
        }
      }

      await logAudit(tx, userId, 'product', productId, 'update', `Producto actualizado: ${prod.name}`, email);
      return { ...prod, variants: updatedVariants };
    });

    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Datos inválidos' });
    }
    console.error('Error updating product:', error);
    res.status(500).json({ error: error.message || 'No se pudo actualizar el producto.' });
  }
});

apiRouter.delete('/products/:id', async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: 'ID inválido' });
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    await db.transaction(async (tx) => {
      const found = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.userId, userId)));
      if (found.length === 0) throw new Error('Producto no encontrado');

      await tx.delete(products).where(and(eq(products.id, productId), eq(products.userId, userId)));
      await logAudit(tx, userId, 'product', productId, 'delete', `Producto eliminado: ${found[0].name}`, email);
    });

    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: error.message || 'No se pudo eliminar el producto.' });
  }
});

const adjustStockSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, 'El ajuste debe ser distinto de 0'),
  reason: z.string().min(1, 'Indica el motivo del ajuste'),
});

apiRouter.post('/variants/:id/adjust', async (req: AuthRequest, res) => {
  try {
    const variantId = Number(req.params.id);
    if (!Number.isInteger(variantId)) return res.status(400).json({ error: 'ID inválido' });
    const { delta, reason } = adjustStockSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const updated = await db.transaction(async (tx) => {
      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, variantId), eq(productVariants.userId, userId)));
      if (!variant) throw new Error('Variante no encontrada');

      const newStock = variant.stock + delta;
      if (newStock < variant.reservedStock) {
        throw new Error(
          `No puedes reducir el stock por debajo del stock reservado (${variant.reservedStock} u.).`,
        );
      }

      const [upd] = await tx
        .update(productVariants)
        .set({ stock: newStock, updatedAt: new Date() })
        .where(and(eq(productVariants.id, variantId), eq(productVariants.userId, userId)))
        .returning();

      await tx.insert(inventoryMovements).values({
        userId,
        productId: variant.productId,
        variantId: variant.id,
        movementType: 'ajuste_manual',
        quantityChange: delta,
        previousStock: variant.stock,
        newStock,
        unitCost: variant.unitCost,
        referenceType: 'manual',
        reason: reason.trim(),
        performedBy: email,
        isExample: false,
      });

      await logAudit(
        tx,
        userId,
        'variant',
        variantId,
        'adjust_stock',
        `Ajuste de stock (${delta > 0 ? `+${delta}` : delta}): ${reason}`,
        email,
      );

      return upd;
    });

    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Datos inválidos' });
    }
    res.status(400).json({ error: error.message || 'No se pudo ajustar el stock.' });
  }
});

// Bulk import products from Excel/CSV rows
const importRowSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1),
  category: z.string().default('Calzas'),
  brand: z.string().default(''),
  model: z.string().default(''),
  color: z.string().default('Negro'),
  size: z.string().default('M'),
  stock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(2),
  purchasePrice: z.number().min(0).default(0),
  salePrice: z.number().min(0).default(0),
  isPack: z.boolean().default(false),
  packUnits: z.number().int().min(1).default(1),
  location: z.string().default('Bodega Antofagasta'),
});

apiRouter.post('/products/import', async (req: AuthRequest, res) => {
  try {
    const rows = z.array(importRowSchema).min(1).max(300).parse(req.body.rows);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    let createdCount = 0;
    await db.transaction(async (tx) => {
      // Group rows by SKU or Name
      const grouped = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = (r.sku?.trim() || r.name.trim()).toLowerCase();
        const list = grouped.get(key) || [];
        list.push(r);
        grouped.set(key, list);
      }

      for (const groupRows of grouped.values()) {
        const first = groupRows[0];
        const sku = first.sku?.trim() || generateSku(first.name, first.category);
        const packUnits = first.isPack ? Math.max(2, first.packUnits) : 1;
        const unitCost = first.purchasePrice / packUnits;

        const [prod] = await tx
          .insert(products)
          .values({
            userId,
            sku,
            name: first.name.trim(),
            category: first.category || 'Calzas',
            brand: first.brand || '',
            model: first.model || '',
            purchaseDate: todayChile(),
            purchasePrice: first.purchasePrice,
            salePrice: first.salePrice || first.purchasePrice + 10000 * packUnits,
            location: first.location || 'Bodega Antofagasta',
            isPack: first.isPack,
            packUnits,
            allowSingleUnitSale: true,
            singleUnitSalePrice: Math.round(
              (first.salePrice || first.purchasePrice + 10000 * packUnits) / packUnits,
            ),
            isActive: true,
            isExample: false,
          })
          .returning();

        for (const vr of groupRows) {
          const [v] = await tx
            .insert(productVariants)
            .values({
              userId,
              productId: prod.id,
              skuVariant: generateVariantSku(sku, vr.color, vr.size),
              size: vr.size,
              color: vr.color,
              stock: vr.stock,
              reservedStock: 0,
              minStock: vr.minStock,
              unitCost,
            })
            .returning();

          if (vr.stock > 0) {
            await tx.insert(inventoryMovements).values({
              userId,
              productId: prod.id,
              variantId: v.id,
              movementType: 'stock_inicial',
              quantityChange: vr.stock,
              previousStock: 0,
              newStock: vr.stock,
              unitCost,
              referenceType: 'manual',
              referenceId: prod.id,
              reason: `Importación masiva Excel/CSV (${vr.color} / ${vr.size})`,
              performedBy: email,
              isExample: false,
            });
          }
        }
        createdCount++;
      }

      await logAudit(
        tx,
        userId,
        'product',
        null,
        'import',
        `Importación masiva de ${createdCount} productos (${rows.length} variantes)`,
        email,
      );
    });

    res.status(201).json({ importedProducts: createdCount, importedVariants: rows.length });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Formato de archivo inválido. Revisa las columnas.' });
    }
    console.error('Import error:', error);
    res.status(500).json({ error: error.message || 'Error al importar inventario.' });
  }
});

// =============================================================================
// 3. SALES WITH ATOMIC STOCK DEDUCTION, RESERVATION, CANCELLATION & RETURNS
// =============================================================================
const saleItemInputSchema = z.object({
  productId: z.number().int(),
  variantId: z.number().int(),
  saleMode: z.enum(['unit', 'pack']).default('unit'),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
});

const createSaleSchema = z.object({
  saleDate: z.string().min(8),
  customerName: z.string().default(''),
  customerPhone: z.string().default(''),
  channel: z.string().min(1),
  paymentMethod: z.string().min(1),
  paymentStatus: z.enum(['pagado', 'pendiente', 'parcial']).default('pagado'),
  accountId: z.number().int().nullable().optional(),
  discount: z.number().min(0).default(0),
  shippingCost: z.number().min(0).default(0),
  commission: z.number().min(0).default(0),
  otherCost: z.number().min(0).default(0),
  amountPaid: z.number().min(0).optional(),
  notes: z.string().default(''),
  items: z.array(saleItemInputSchema).min(1, 'Agrega al menos una prenda a la venta'),
});

apiRouter.post('/sales', async (req: AuthRequest, res) => {
  try {
    const parsed = createSaleSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const result = await db.transaction(async (tx) => {
      // Determine account
      let accountId = parsed.accountId ?? null;
      if (!accountId) {
        const userAccounts = await tx
          .select()
          .from(accounts)
          .where(eq(accounts.userId, userId));
        const defaultAcc = userAccounts.find((a) => a.isDefault) || userAccounts[0];
        accountId = defaultAcc?.id ?? null;
      }

      // Generate sequential sale number
      const existingSales = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(eq(sales.userId, userId));
      const saleNumber = `VTA-${String(existingSales.length + 1).padStart(4, '0')}`;

      // Validate and compute totals per line item (also prevent aggregate over-selling across duplicate variant lines)
      const requestedPhysicalByVariant = new Map<number, number>();
      const resolvedLines: Array<{
        product: typeof products.$inferSelect;
        variant: typeof productVariants.$inferSelect;
        saleMode: 'unit' | 'pack';
        quantity: number;
        physicalUnits: number;
        unitPrice: number;
        lineSubtotal: number;
        lineCogs: number;
      }> = [];

      for (const item of parsed.items) {
        const [product] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, item.productId), eq(products.userId, userId)));
        if (!product) throw new Error('Producto no encontrado en tu inventario.');

        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.id, item.variantId),
              eq(productVariants.productId, product.id),
              eq(productVariants.userId, userId),
            ),
          );
        if (!variant) throw new Error('Variante de talla/color no encontrada.');

        if (item.saleMode === 'unit' && product.isPack && !product.allowSingleUnitSale) {
          throw new Error(`El pack "${product.name}" no tiene habilitada la venta por unidad suelta.`);
        }

        const physicalUnits =
          item.saleMode === 'pack' && product.isPack ? item.quantity * product.packUnits : item.quantity;

        const prevRequested = requestedPhysicalByVariant.get(variant.id) || 0;
        const available = variant.stock - variant.reservedStock;
        if (prevRequested + physicalUnits > available) {
          throw new Error(
            `Stock insuficiente para ${product.name} (${variant.color} / ${variant.size}). Disponible: ${available} prendas físicas, solicitado: ${prevRequested + physicalUnits}.`,
          );
        }
        requestedPhysicalByVariant.set(variant.id, prevRequested + physicalUnits);

        const lineSubtotal = item.unitPrice * item.quantity;
        const lineCogs = variant.unitCost * physicalUnits;

        resolvedLines.push({
          product,
          variant,
          saleMode: item.saleMode,
          quantity: item.quantity,
          physicalUnits,
          unitPrice: item.unitPrice,
          lineSubtotal,
          lineCogs,
        });
      }

      const subtotal = resolvedLines.reduce((acc, l) => acc + l.lineSubtotal, 0);
      const total = Math.max(0, subtotal - parsed.discount);
      const totalCogs = resolvedLines.reduce((acc, l) => acc + l.lineCogs, 0);
      const estimatedProfit =
        total - totalCogs - parsed.commission - parsed.shippingCost - parsed.otherCost;

      const amountPaid =
        parsed.paymentStatus === 'pagado'
          ? total
          : parsed.paymentStatus === 'pendiente'
            ? 0
            : Math.min(total, parsed.amountPaid ?? 0);

      const [sale] = await tx
        .insert(sales)
        .values({
          userId,
          saleNumber,
          saleDate: parsed.saleDate,
          customerName: parsed.customerName.trim(),
          customerPhone: parsed.customerPhone.trim(),
          channel: parsed.channel,
          paymentMethod: parsed.paymentMethod,
          paymentStatus: parsed.paymentStatus,
          accountId,
          subtotal,
          discount: parsed.discount,
          shippingCost: parsed.shippingCost,
          commission: parsed.commission,
          otherCost: parsed.otherCost,
          total,
          totalCogs,
          estimatedProfit,
          amountPaid,
          notes: parsed.notes.trim(),
          performedBy: email,
          isExample: false,
        })
        .returning();

      const insertedItems = [];
      // Track live variant stocks within the same transaction in case the same variant appears twice
      const liveVariantState = new Map<number, { stock: number; reservedStock: number }>();

      for (const line of resolvedLines) {
        const [saleItem] = await tx
          .insert(saleItems)
          .values({
            saleId: sale.id,
            productId: line.product.id,
            variantId: line.variant.id,
            productName: line.product.name,
            size: line.variant.size,
            color: line.variant.color,
            saleMode: line.saleMode,
            quantity: line.quantity,
            physicalUnitsDeducted: line.physicalUnits,
            unitPrice: line.unitPrice,
            unitCostSnapshot: line.variant.unitCost,
            lineSubtotal: line.lineSubtotal,
            lineCogs: line.lineCogs,
            returnedQuantity: 0,
          })
          .returning();
        insertedItems.push(saleItem);

        const state = liveVariantState.get(line.variant.id) || {
          stock: line.variant.stock,
          reservedStock: line.variant.reservedStock,
        };

        if (parsed.paymentStatus === 'pendiente') {
          // Reserve stock without deducting final stock or recording cash income
          const newReserved = state.reservedStock + line.physicalUnits;
          await tx
            .update(productVariants)
            .set({ reservedStock: newReserved, updatedAt: new Date() })
            .where(and(eq(productVariants.id, line.variant.id), eq(productVariants.userId, userId)));

          liveVariantState.set(line.variant.id, { stock: state.stock, reservedStock: newReserved });

          await tx.insert(inventoryMovements).values({
            userId,
            productId: line.product.id,
            variantId: line.variant.id,
            movementType: 'reserva_venta',
            quantityChange: -line.physicalUnits,
            previousStock: state.stock,
            newStock: state.stock,
            unitCost: line.variant.unitCost,
            referenceType: 'sale',
            referenceId: sale.id,
            reason: `Reserva por venta pendiente ${saleNumber} (${line.quantity} ${line.saleMode === 'pack' ? 'pack(s)' : 'u.'})`,
            performedBy: email,
            isExample: false,
          });
        } else {
          // Confirmed sale: deduct stock immediately and atomically
          const prevStock = state.stock;
          const newStock = prevStock - line.physicalUnits;
          await tx
            .update(productVariants)
            .set({ stock: newStock, updatedAt: new Date() })
            .where(and(eq(productVariants.id, line.variant.id), eq(productVariants.userId, userId)));

          liveVariantState.set(line.variant.id, { stock: newStock, reservedStock: state.reservedStock });

          await tx.insert(inventoryMovements).values({
            userId,
            productId: line.product.id,
            variantId: line.variant.id,
            movementType: 'salida_venta',
            quantityChange: -line.physicalUnits,
            previousStock: prevStock,
            newStock,
            unitCost: line.variant.unitCost,
            referenceType: 'sale',
            referenceId: sale.id,
            reason: `Venta ${saleNumber} (${line.quantity} ${line.saleMode === 'pack' ? 'pack(s)' : 'u.'} = ${line.physicalUnits} prendas)`,
            performedBy: email,
            isExample: false,
          });
        }
      }

      // Generate automatic cashflow entry ONLY for collected money (pagado or parcial with amountPaid > 0)
      if (amountPaid > 0) {
        await tx.insert(financialTransactions).values({
          userId,
          date: parsed.saleDate,
          direction: 'ingreso',
          classification: 'cobro_venta',
          category: 'Cobros de ventas',
          concept: `Cobro venta ${saleNumber}${parsed.customerName ? ` - ${parsed.customerName}` : ''}`,
          amount: amountPaid,
          paymentMethod: parsed.paymentMethod,
          accountId,
          referenceType: 'sale',
          referenceId: sale.id,
          notes: `Canal: ${parsed.channel}`,
          performedBy: email,
          isExample: false,
        });
      }

      await logAudit(
        tx,
        userId,
        'sale',
        sale.id,
        'create',
        `Venta ${saleNumber} registrada por $${Math.round(total).toLocaleString('es-CL')} (${parsed.paymentStatus})`,
        email,
      );

      return { ...sale, items: insertedItems };
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Datos de venta inválidos' });
    }
    res.status(400).json({ error: error.message || 'No se pudo registrar la venta.' });
  }
});

// Confirm payment on a pending or partial sale
apiRouter.post('/sales/:id/confirm-payment', async (req: AuthRequest, res) => {
  try {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId)) return res.status(400).json({ error: 'ID inválido' });
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;
    const paymentDate = typeof req.body.date === 'string' && req.body.date ? req.body.date : todayChile();

    const updated = await db.transaction(async (tx) => {
      const [sale] = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.userId, userId)));
      if (!sale) throw new Error('Venta no encontrada');
      if (sale.paymentStatus === 'pagado') throw new Error('Esta venta ya fue cobrada.');
      if (sale.paymentStatus === 'cancelado') throw new Error('No se puede cobrar una venta cancelada.');

      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));

      // If sale was pending (reserved), now deduct real stock and clear reservation
      if (sale.paymentStatus === 'pendiente') {
        for (const item of items) {
          const [variant] = await tx
            .select()
            .from(productVariants)
            .where(and(eq(productVariants.id, item.variantId), eq(productVariants.userId, userId)));
          if (!variant) continue;

          const newStock = Math.max(0, variant.stock - item.physicalUnitsDeducted);
          const newReserved = Math.max(0, variant.reservedStock - item.physicalUnitsDeducted);
          await tx
            .update(productVariants)
            .set({ stock: newStock, reservedStock: newReserved, updatedAt: new Date() })
            .where(eq(productVariants.id, variant.id));

          await tx.insert(inventoryMovements).values({
            userId,
            productId: item.productId,
            variantId: item.variantId,
            movementType: 'salida_venta',
            quantityChange: -item.physicalUnitsDeducted,
            previousStock: variant.stock,
            newStock,
            unitCost: item.unitCostSnapshot,
            referenceType: 'sale',
            referenceId: sale.id,
            reason: `Confirmación de pago venta ${sale.saleNumber}`,
            performedBy: email,
            isExample: false,
          });
        }
      }

      const remaining = Math.max(0, sale.total - sale.amountPaid);
      if (remaining > 0) {
        await tx.insert(financialTransactions).values({
          userId,
          date: paymentDate,
          direction: 'ingreso',
          classification: 'cobro_venta',
          category: 'Cobros de ventas',
          concept: `Cobro saldo venta ${sale.saleNumber}`,
          amount: remaining,
          paymentMethod: sale.paymentMethod,
          accountId: sale.accountId,
          referenceType: 'sale',
          referenceId: sale.id,
          notes: 'Pago confirmado',
          performedBy: email,
          isExample: false,
        });
      }

      const [updSale] = await tx
        .update(sales)
        .set({ paymentStatus: 'pagado', amountPaid: sale.total })
        .where(eq(sales.id, saleId))
        .returning();

      await logAudit(
        tx,
        userId,
        'sale',
        saleId,
        'confirm_payment',
        `Cobro confirmado en venta ${sale.saleNumber} por $${Math.round(remaining).toLocaleString('es-CL')}`,
        email,
      );

      return updSale;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo confirmar el pago.' });
  }
});

// Cancel sale and atomically restore stock & reverse cashflow
apiRouter.post('/sales/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId)) return res.status(400).json({ error: 'ID inválido' });
    const restock = req.body.restock !== false;
    const reason = typeof req.body.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : 'Cancelación de venta';
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const updated = await db.transaction(async (tx) => {
      const [sale] = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.userId, userId)));
      if (!sale) throw new Error('Venta no encontrada');
      if (sale.paymentStatus === 'cancelado') throw new Error('La venta ya fue cancelada.');

      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));

      for (const item of items) {
        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(and(eq(productVariants.id, item.variantId), eq(productVariants.userId, userId)));
        if (!variant) continue;

        const remainingUnits = Math.max(0, item.physicalUnitsDeducted - item.returnedQuantity);
        if (remainingUnits <= 0) continue;

        if (sale.paymentStatus === 'pendiente') {
          const newReserved = Math.max(0, variant.reservedStock - remainingUnits);
          await tx
            .update(productVariants)
            .set({ reservedStock: newReserved, updatedAt: new Date() })
            .where(eq(productVariants.id, variant.id));

          await tx.insert(inventoryMovements).values({
            userId,
            productId: item.productId,
            variantId: item.variantId,
            movementType: 'liberacion_reserva',
            quantityChange: remainingUnits,
            previousStock: variant.stock,
            newStock: variant.stock,
            unitCost: item.unitCostSnapshot,
            referenceType: 'sale',
            referenceId: sale.id,
            reason: `Liberación de reserva por cancelación de ${sale.saleNumber}: ${reason}`,
            performedBy: email,
            isExample: false,
          });
        } else if (restock) {
          const newStock = variant.stock + remainingUnits;
          await tx
            .update(productVariants)
            .set({ stock: newStock, updatedAt: new Date() })
            .where(eq(productVariants.id, variant.id));

          await tx.insert(inventoryMovements).values({
            userId,
            productId: item.productId,
            variantId: item.variantId,
            movementType: 'devolucion_cancelacion',
            quantityChange: remainingUnits,
            previousStock: variant.stock,
            newStock,
            unitCost: item.unitCostSnapshot,
            referenceType: 'sale',
            referenceId: sale.id,
            reason: `Devolución a stock por cancelación de ${sale.saleNumber}: ${reason}`,
            performedBy: email,
            isExample: false,
          });
        }
      }

      // Remove auto-generated sale payment transactions so cash balance reverses accurately
      if (sale.amountPaid > 0) {
        await tx
          .delete(financialTransactions)
          .where(
            and(
              eq(financialTransactions.userId, userId),
              eq(financialTransactions.referenceType, 'sale'),
              eq(financialTransactions.referenceId, sale.id),
            ),
          );
      }

      const [upd] = await tx
        .update(sales)
        .set({
          paymentStatus: 'cancelado',
          amountPaid: 0,
          notes: sale.notes ? `${sale.notes} | Cancelada: ${reason}` : `Cancelada: ${reason}`,
        })
        .where(eq(sales.id, saleId))
        .returning();

      await logAudit(
        tx,
        userId,
        'sale',
        saleId,
        'cancel',
        `Venta ${sale.saleNumber} cancelada (${restock ? 'stock devuelto' : 'sin devolución de stock'})`,
        email,
      );

      return upd;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo cancelar la venta.' });
  }
});

// Return garments from a confirmed sale
const returnSaleSchema = z.object({
  itemId: z.number().int(),
  physicalUnits: z.number().int().min(1),
  condition: z.enum(['buen_estado', 'danado']),
  refundAmount: z.number().min(0).default(0),
  reason: z.string().default('Devolución de cliente'),
});

apiRouter.post('/sales/:id/return', async (req: AuthRequest, res) => {
  try {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId)) return res.status(400).json({ error: 'ID inválido' });
    const parsed = returnSaleSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    await db.transaction(async (tx) => {
      const [sale] = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.userId, userId)));
      if (!sale) throw new Error('Venta no encontrada');
      if (sale.paymentStatus === 'cancelado') throw new Error('Venta ya cancelada');

      const [item] = await tx
        .select()
        .from(saleItems)
        .where(and(eq(saleItems.id, parsed.itemId), eq(saleItems.saleId, saleId)));
      if (!item) throw new Error('Ítem de venta no encontrado');

      const maxReturnable = item.physicalUnitsDeducted - item.returnedQuantity;
      if (parsed.physicalUnits > maxReturnable) {
        throw new Error(`Solo puedes devolver hasta ${maxReturnable} prendas de este ítem.`);
      }

      await tx
        .update(saleItems)
        .set({ returnedQuantity: item.returnedQuantity + parsed.physicalUnits })
        .where(eq(saleItems.id, item.id));

      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, item.variantId), eq(productVariants.userId, userId)));

      if (variant) {
        const restockQty = parsed.condition === 'buen_estado' ? parsed.physicalUnits : 0;
        const newStock = variant.stock + restockQty;
        if (restockQty > 0) {
          await tx
            .update(productVariants)
            .set({ stock: newStock, updatedAt: new Date() })
            .where(eq(productVariants.id, variant.id));
        }

        await tx.insert(inventoryMovements).values({
          userId,
          productId: item.productId,
          variantId: item.variantId,
          movementType: 'devolucion_cliente',
          quantityChange: restockQty,
          previousStock: variant.stock,
          newStock,
          unitCost: item.unitCostSnapshot,
          referenceType: 'sale',
          referenceId: sale.id,
          reason: `Devolución ${sale.saleNumber} (${parsed.condition === 'buen_estado' ? 'reingresada a stock' : 'prenda dañada, no reingresada'}): ${parsed.reason}`,
          performedBy: email,
          isExample: false,
        });
      }

      if (parsed.refundAmount > 0) {
        await tx.insert(financialTransactions).values({
          userId,
          date: todayChile(),
          direction: 'egreso',
          classification: 'otro_egreso',
          category: 'Devoluciones a clientes',
          concept: `Reembolso devolución ${sale.saleNumber}`,
          amount: parsed.refundAmount,
          paymentMethod: sale.paymentMethod,
          accountId: sale.accountId,
          referenceType: 'sale',
          referenceId: sale.id,
          notes: parsed.reason,
          performedBy: email,
          isExample: false,
        });
      }

      // Check if all items fully returned
      const allItems = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));
      const allReturned = allItems.every((i) => i.returnedQuantity >= i.physicalUnitsDeducted);
      if (allReturned) {
        await tx.update(sales).set({ paymentStatus: 'devuelto' }).where(eq(sales.id, saleId));
      }

      await logAudit(
        tx,
        userId,
        'sale',
        saleId,
        'return',
        `Devolución de ${parsed.physicalUnits} prenda(s) en ${sale.saleNumber} (${parsed.condition})`,
        email,
      );
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo procesar la devolución.' });
  }
});

// =============================================================================
// 4. PURCHASES & RESTOCKING (STOCK ONLY INCREASES ON CONFIRMED RECEPTION)
// =============================================================================
const purchaseItemInputSchema = z.object({
  productId: z.number().int(),
  variantId: z.number().int(),
  quantityOrdered: z.number().int().min(1),
  isPackPurchase: z.boolean().default(false),
  unitsPerPack: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
});

const createPurchaseSchema = z.object({
  orderNumber: z.string().optional(),
  supplierId: z.number().int().nullable().optional(),
  orderDate: z.string().min(8),
  estimatedArrival: z.string().default(''),
  status: z
    .enum(['pedido_creado', 'pagado', 'en_transito'])
    .default('pedido_creado'),
  discount: z.number().min(0).default(0),
  shippingCost: z.number().min(0).default(0),
  taxes: z.number().min(0).default(0),
  otherCosts: z.number().min(0).default(0),
  costAllocationMethod: z.enum(['proportional', 'equal']).default('proportional'),
  paymentMethod: z.string().default('Transferencia'),
  accountId: z.number().int().nullable().optional(),
  isPaid: z.boolean().default(false),
  notes: z.string().default(''),
  items: z.array(purchaseItemInputSchema).min(1, 'Agrega al menos un producto a la compra'),
});

apiRouter.post('/purchases', async (req: AuthRequest, res) => {
  try {
    const parsed = createPurchaseSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const created = await db.transaction(async (tx) => {
      const existingPos = await tx
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.userId, userId));
      const orderNumber =
        parsed.orderNumber?.trim() || `OC-${String(existingPos.length + 1).padStart(4, '0')}`;

      const subtotal = parsed.items.reduce((acc, i) => acc + i.unitPrice * i.quantityOrdered, 0);
      const extraNetCosts = parsed.shippingCost + parsed.taxes + parsed.otherCosts - parsed.discount;
      const total = Math.max(0, subtotal + extraNetCosts);
      const totalPhysicalUnits = parsed.items.reduce(
        (acc, i) => acc + i.quantityOrdered * (i.isPackPurchase ? i.unitsPerPack : 1),
        0,
      );

      let accountId = parsed.accountId ?? null;
      if (!accountId) {
        const userAccounts = await tx.select().from(accounts).where(eq(accounts.userId, userId));
        accountId = (userAccounts.find((a) => a.isDefault) || userAccounts[0])?.id ?? null;
      }

      const isPaid = parsed.isPaid || parsed.status === 'pagado';
      const status = isPaid && parsed.status === 'pedido_creado' ? 'pagado' : parsed.status;

      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          userId,
          orderNumber,
          supplierId: parsed.supplierId ?? null,
          orderDate: parsed.orderDate,
          estimatedArrival: parsed.estimatedArrival,
          receivedDate: '',
          status,
          subtotal,
          discount: parsed.discount,
          shippingCost: parsed.shippingCost,
          taxes: parsed.taxes,
          otherCosts: parsed.otherCosts,
          total,
          costAllocationMethod: parsed.costAllocationMethod,
          paymentMethod: parsed.paymentMethod,
          accountId,
          isPaid,
          notes: parsed.notes.trim(),
          isExample: false,
        })
        .returning();

      const insertedItems = [];
      for (const item of parsed.items) {
        const unitsPerItem = item.isPackPurchase ? Math.max(2, item.unitsPerPack) : 1;
        const linePhysicalUnits = item.quantityOrdered * unitsPerItem;
        const lineBaseValue = item.unitPrice * item.quantityOrdered;

        let lineExtraAllocated = 0;
        if (parsed.costAllocationMethod === 'equal' || subtotal === 0) {
          lineExtraAllocated =
            totalPhysicalUnits > 0 ? (extraNetCosts / totalPhysicalUnits) * linePhysicalUnits : 0;
        } else {
          lineExtraAllocated = extraNetCosts * (lineBaseValue / subtotal);
        }

        const allocatedExtraCostPerUnit =
          linePhysicalUnits > 0 ? lineExtraAllocated / linePhysicalUnits : 0;
        const baseCostPerPhysicalUnit = item.unitPrice / unitsPerItem;
        const finalUnitCost = Math.max(0, baseCostPerPhysicalUnit + allocatedExtraCostPerUnit);

        const [poItem] = await tx
          .insert(purchaseOrderItems)
          .values({
            purchaseOrderId: po.id,
            productId: item.productId,
            variantId: item.variantId,
            quantityOrdered: item.quantityOrdered,
            quantityReceived: 0,
            isPackPurchase: item.isPackPurchase,
            unitsPerPack: unitsPerItem,
            unitPrice: item.unitPrice,
            allocatedExtraCostPerUnit,
            finalUnitCost,
          })
          .returning();
        insertedItems.push(poItem);
      }

      if (isPaid && total > 0) {
        await tx.insert(financialTransactions).values({
          userId,
          date: parsed.orderDate,
          direction: 'egreso',
          classification: 'pago_proveedor',
          category: 'Pago a proveedores',
          concept: `Pago orden de compra ${orderNumber}`,
          amount: total,
          paymentMethod: parsed.paymentMethod,
          accountId,
          referenceType: 'purchase',
          referenceId: po.id,
          notes: parsed.notes.trim(),
          performedBy: email,
          isExample: false,
        });
      }

      await logAudit(
        tx,
        userId,
        'purchase_order',
        po.id,
        'create',
        `Orden de compra ${orderNumber} creada por $${Math.round(total).toLocaleString('es-CL')} (stock pendiente de recepción)`,
        email,
      );

      return { ...po, items: insertedItems };
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Datos inválidos' });
    }
    res.status(400).json({ error: error.message || 'No se pudo crear la orden de compra.' });
  }
});

// Update purchase order status or mark as paid
apiRouter.post('/purchases/:id/status', async (req: AuthRequest, res) => {
  try {
    const poId = Number(req.params.id);
    if (!Number.isInteger(poId)) return res.status(400).json({ error: 'ID inválido' });
    const status = z
      .enum(['pedido_creado', 'pagado', 'en_transito', 'cancelado'])
      .parse(req.body.status);
    const markPaid = Boolean(req.body.markPaid || status === 'pagado');
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const updated = await db.transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.userId, userId)));
      if (!po) throw new Error('Orden de compra no encontrada');

      let isPaid = po.isPaid;
      if (markPaid && !po.isPaid && status !== 'cancelado' && po.total > 0) {
        isPaid = true;
        await tx.insert(financialTransactions).values({
          userId,
          date: todayChile(),
          direction: 'egreso',
          classification: 'pago_proveedor',
          category: 'Pago a proveedores',
          concept: `Pago orden de compra ${po.orderNumber}`,
          amount: po.total,
          paymentMethod: po.paymentMethod,
          accountId: po.accountId,
          referenceType: 'purchase',
          referenceId: po.id,
          notes: 'Pago confirmado',
          performedBy: email,
          isExample: false,
        });
      }

      const [upd] = await tx
        .update(purchaseOrders)
        .set({ status, isPaid })
        .where(eq(purchaseOrders.id, poId))
        .returning();

      await logAudit(
        tx,
        userId,
        'purchase_order',
        poId,
        'status_update',
        `OC ${po.orderNumber} cambiada a ${status}`,
        email,
      );

      return upd;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo actualizar el estado.' });
  }
});

// Receive items on a purchase order -> THIS IS WHERE STOCK INCREASES AND WEIGHTED AVG COST UPDATES
const receivePurchaseSchema = z.object({
  receivedDate: z.string().optional(),
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.number().int(),
        quantityToReceive: z.number().int().min(0),
      }),
    )
    .min(1),
});

apiRouter.post('/purchases/:id/receive', async (req: AuthRequest, res) => {
  try {
    const poId = Number(req.params.id);
    if (!Number.isInteger(poId)) return res.status(400).json({ error: 'ID inválido' });
    const parsed = receivePurchaseSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;
    const receivedDate = parsed.receivedDate || todayChile();

    const updated = await db.transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.userId, userId)));
      if (!po) throw new Error('Orden de compra no encontrada');
      if (po.status === 'cancelado') throw new Error('No se puede recibir una orden cancelada');

      const [settings] = await tx
        .select()
        .from(businessSettings)
        .where(eq(businessSettings.userId, userId));
      const valuationMethod = settings?.valuationMethod || 'weighted_average';

      const poItems = await tx
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, poId));
      const poItemMap = new Map(poItems.map((i) => [i.id, i]));

      let totalPhysicalAdded = 0;

      for (const rec of parsed.items) {
        if (rec.quantityToReceive <= 0) continue;
        const poItem = poItemMap.get(rec.purchaseOrderItemId);
        if (!poItem) continue;

        const pending = poItem.quantityOrdered - poItem.quantityReceived;
        const qtyAccepted = Math.min(rec.quantityToReceive, pending);
        if (qtyAccepted <= 0) continue;

        const physicalAdded = poItem.isPackPurchase
          ? qtyAccepted * poItem.unitsPerPack
          : qtyAccepted;

        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(and(eq(productVariants.id, poItem.variantId), eq(productVariants.userId, userId)));
        if (!variant) continue;

        const prevStock = variant.stock;
        const newStock = prevStock + physicalAdded;

        let newUnitCost = poItem.finalUnitCost;
        if (valuationMethod === 'weighted_average' && prevStock > 0 && newStock > 0) {
          newUnitCost =
            (prevStock * variant.unitCost + physicalAdded * poItem.finalUnitCost) / newStock;
        }

        await tx
          .update(productVariants)
          .set({
            stock: newStock,
            unitCost: newUnitCost,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, variant.id));

        await tx
          .update(purchaseOrderItems)
          .set({ quantityReceived: poItem.quantityReceived + qtyAccepted })
          .where(eq(purchaseOrderItems.id, poItem.id));

        await tx.insert(inventoryMovements).values({
          userId,
          productId: poItem.productId,
          variantId: poItem.variantId,
          movementType: 'entrada_compra',
          quantityChange: physicalAdded,
          previousStock: prevStock,
          newStock,
          unitCost: poItem.finalUnitCost,
          referenceType: 'purchase',
          referenceId: po.id,
          reason: `Recepción OC ${po.orderNumber} (+${qtyAccepted} ${poItem.isPackPurchase ? `pack(s) = ${physicalAdded} prendas` : 'u.'})`,
          performedBy: email,
          isExample: false,
        });

        totalPhysicalAdded += physicalAdded;
      }

      if (totalPhysicalAdded === 0) {
        throw new Error('No hay unidades pendientes por recibir en las líneas seleccionadas.');
      }

      const refreshedItems = await tx
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, poId));
      const allReceived = refreshedItems.every((i) => i.quantityReceived >= i.quantityOrdered);

      const [updPo] = await tx
        .update(purchaseOrders)
        .set({
          status: allReceived ? 'recibido' : 'recibido_parcial',
          receivedDate,
        })
        .where(eq(purchaseOrders.id, poId))
        .returning();

      await logAudit(
        tx,
        userId,
        'purchase_order',
        poId,
        'receive',
        `Recepción confirmada en OC ${po.orderNumber} (+${totalPhysicalAdded} prendas físicas al inventario)`,
        email,
      );

      return { ...updPo, items: refreshedItems };
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo confirmar la recepción.' });
  }
});

// =============================================================================
// 5. SUPPLIERS
// =============================================================================
const supplierSchema = z.object({
  name: z.string().min(1, 'Nombre comercial obligatorio'),
  country: z.string().default('Chile'),
  city: z.string().default(''),
  website: z.string().default(''),
  whatsapp: z.string().default(''),
  email: z.string().default(''),
  address: z.string().default(''),
  productsSupplied: z.string().default(''),
  minOrderQty: z.number().int().min(1).default(1),
  avgLeadDays: z.number().int().min(0).default(7),
  shippingCostEstimate: z.number().min(0).default(0),
  rating: z.number().int().min(1).max(5).default(5),
  notes: z.string().default(''),
});

apiRouter.post('/suppliers', async (req: AuthRequest, res) => {
  try {
    const parsed = supplierSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const [created] = await db
      .insert(suppliers)
      .values({ ...parsed, userId, isExample: false })
      .returning();

    await logAudit(db, userId, 'supplier', created.id, 'create', `Proveedor creado: ${created.name}`, email);
    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Datos inválidos' });
    }
    res.status(500).json({ error: 'No se pudo guardar el proveedor.' });
  }
});

apiRouter.put('/suppliers/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const parsed = supplierSchema.parse(req.body);
    const userId = req.dbUser!.id;

    const [updated] = await db
      .update(suppliers)
      .set(parsed)
      .where(and(eq(suppliers.id, id), eq(suppliers.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo actualizar el proveedor.' });
  }
});

apiRouter.delete('/suppliers/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const userId = req.dbUser!.id;
    await db.delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.userId, userId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'No se pudo eliminar el proveedor.' });
  }
});

// =============================================================================
// 6. EXPENSES (FIXED & VARIABLE — NEVER AUTO-PAID WITHOUT CONFIRMATION)
// =============================================================================
const expenseSchema = z.object({
  date: z.string().min(8),
  dueDate: z.string().default(''),
  expenseType: z.enum(['fijo', 'variable']),
  category: z.string().min(1),
  concept: z.string().min(1, 'Concepto obligatorio'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  paymentMethod: z.string().default('Transferencia'),
  accountId: z.number().int().nullable().optional(),
  isRecurring: z.boolean().default(false),
  recurringDay: z.number().int().min(1).max(31).nullable().optional(),
  confirmPaidNow: z.boolean().default(false),
  receiptRef: z.string().default(''),
  notes: z.string().default(''),
});

apiRouter.post('/expenses', async (req: AuthRequest, res) => {
  try {
    const parsed = expenseSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const created = await db.transaction(async (tx) => {
      let accountId = parsed.accountId ?? null;
      if (!accountId) {
        const userAccounts = await tx.select().from(accounts).where(eq(accounts.userId, userId));
        accountId = (userAccounts.find((a) => a.isDefault) || userAccounts[0])?.id ?? null;
      }

      const status = parsed.confirmPaidNow ? 'pagado' : 'pendiente';
      const paidDate = parsed.confirmPaidNow ? parsed.date : '';

      const [exp] = await tx
        .insert(expenses)
        .values({
          userId,
          date: parsed.date,
          dueDate: parsed.dueDate || parsed.date,
          expenseType: parsed.expenseType,
          category: parsed.category,
          concept: parsed.concept.trim(),
          amount: parsed.amount,
          paymentMethod: parsed.paymentMethod,
          accountId,
          isRecurring: parsed.isRecurring,
          recurringDay: parsed.recurringDay ?? null,
          status,
          paidDate,
          receiptRef: parsed.receiptRef.trim(),
          notes: parsed.notes.trim(),
          isExample: false,
        })
        .returning();

      if (parsed.confirmPaidNow) {
        await tx.insert(financialTransactions).values({
          userId,
          date: parsed.date,
          direction: 'egreso',
          classification: parsed.expenseType === 'fijo' ? 'gasto_fijo' : 'gasto_variable',
          category: parsed.category,
          concept: parsed.concept.trim(),
          amount: parsed.amount,
          paymentMethod: parsed.paymentMethod,
          accountId,
          referenceType: 'expense',
          referenceId: exp.id,
          receiptRef: parsed.receiptRef.trim(),
          notes: parsed.notes.trim(),
          performedBy: email,
          isExample: false,
        });
      }

      await logAudit(
        tx,
        userId,
        'expense',
        exp.id,
        'create',
        `Gasto ${parsed.expenseType} registrado: ${exp.concept} ($${Math.round(exp.amount).toLocaleString('es-CL')} - ${status})`,
        email,
      );

      return exp;
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Datos inválidos' });
    }
    res.status(400).json({ error: error.message || 'No se pudo registrar el gasto.' });
  }
});

apiRouter.post('/expenses/:id/pay', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;
    const paidDate = typeof req.body.paidDate === 'string' && req.body.paidDate ? req.body.paidDate : todayChile();
    const accountIdOverride = typeof req.body.accountId === 'number' ? req.body.accountId : null;

    const updated = await db.transaction(async (tx) => {
      const [exp] = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
      if (!exp) throw new Error('Gasto no encontrado');
      if (exp.status === 'pagado') throw new Error('Este gasto ya fue marcado como pagado.');

      const accountId = accountIdOverride ?? exp.accountId;

      const [upd] = await tx
        .update(expenses)
        .set({ status: 'pagado', paidDate, accountId })
        .where(eq(expenses.id, id))
        .returning();

      await tx.insert(financialTransactions).values({
        userId,
        date: paidDate,
        direction: 'egreso',
        classification: exp.expenseType === 'fijo' ? 'gasto_fijo' : 'gasto_variable',
        category: exp.category,
        concept: exp.concept,
        amount: exp.amount,
        paymentMethod: exp.paymentMethod,
        accountId,
        referenceType: 'expense',
        referenceId: exp.id,
        receiptRef: exp.receiptRef,
        notes: exp.notes,
        performedBy: email,
        isExample: false,
      });

      await logAudit(
        tx,
        userId,
        'expense',
        id,
        'pay',
        `Pago confirmado de gasto: ${exp.concept} ($${Math.round(exp.amount).toLocaleString('es-CL')})`,
        email,
      );

      return upd;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo confirmar el pago.' });
  }
});

apiRouter.delete('/expenses/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const userId = req.dbUser!.id;

    await db.transaction(async (tx) => {
      await tx
        .delete(financialTransactions)
        .where(
          and(
            eq(financialTransactions.userId, userId),
            eq(financialTransactions.referenceType, 'expense'),
            eq(financialTransactions.referenceId, id),
          ),
        );
      await tx.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'No se pudo eliminar el gasto.' });
  }
});

// =============================================================================
// 7. FINANCIAL TRANSACTIONS & ACCOUNTS
// =============================================================================
const transactionSchema = z.object({
  date: z.string().min(8),
  direction: z.enum(['ingreso', 'egreso', 'transferencia']),
  classification: z.enum([
    'cobro_venta',
    'aporte_capital',
    'otro_ingreso',
    'pago_proveedor',
    'gasto_fijo',
    'gasto_variable',
    'retiro_propietario',
    'transferencia_cuentas',
    'otro_egreso',
  ]),
  category: z.string().min(1),
  concept: z.string().min(1, 'Concepto obligatorio'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  paymentMethod: z.string().default('Transferencia'),
  accountId: z.number().int().nullable().optional(),
  targetAccountId: z.number().int().nullable().optional(),
  receiptRef: z.string().default(''),
  notes: z.string().default(''),
});

apiRouter.post('/transactions', async (req: AuthRequest, res) => {
  try {
    const parsed = transactionSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    if (parsed.direction === 'transferencia') {
      if (!parsed.accountId || !parsed.targetAccountId || parsed.accountId === parsed.targetAccountId) {
        return res.status(400).json({ error: 'Selecciona cuentas de origen y destino distintas.' });
      }
    }

    let accountId = parsed.accountId ?? null;
    if (!accountId) {
      const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
      accountId = (userAccounts.find((a) => a.isDefault) || userAccounts[0])?.id ?? null;
    }

    const [created] = await db
      .insert(financialTransactions)
      .values({
        userId,
        date: parsed.date,
        direction: parsed.direction,
        classification: parsed.classification,
        category: parsed.category,
        concept: parsed.concept.trim(),
        amount: parsed.amount,
        paymentMethod: parsed.paymentMethod,
        accountId,
        targetAccountId: parsed.direction === 'transferencia' ? parsed.targetAccountId ?? null : null,
        referenceType: 'manual',
        receiptRef: parsed.receiptRef.trim(),
        notes: parsed.notes.trim(),
        performedBy: email,
        isExample: false,
      })
      .returning();

    await logAudit(
      db,
      userId,
      'transaction',
      created.id,
      'create',
      `Movimiento (${parsed.classification}): ${parsed.concept} $${Math.round(parsed.amount).toLocaleString('es-CL')}`,
      email,
    );

    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Datos inválidos' });
    }
    res.status(400).json({ error: error.message || 'No se pudo registrar el movimiento.' });
  }
});

apiRouter.delete('/transactions/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const userId = req.dbUser!.id;

    const [existing] = await db
      .select()
      .from(financialTransactions)
      .where(and(eq(financialTransactions.id, id), eq(financialTransactions.userId, userId)));
    if (!existing) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (existing.referenceType !== 'manual') {
      return res.status(400).json({
        error: 'Este movimiento proviene de una venta, compra o gasto. Anúlalo desde su módulo de origen.',
      });
    }

    await db
      .delete(financialTransactions)
      .where(and(eq(financialTransactions.id, id), eq(financialTransactions.userId, userId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'No se pudo eliminar el movimiento.' });
  }
});

apiRouter.post('/accounts', async (req: AuthRequest, res) => {
  try {
    const parsed = z
      .object({
        name: z.string().min(1),
        type: z.enum(['banco', 'efectivo', 'digital']),
        initialBalance: z.number().default(0),
      })
      .parse(req.body);
    const userId = req.dbUser!.id;

    const [created] = await db
      .insert(accounts)
      .values({
        userId,
        name: parsed.name.trim(),
        type: parsed.type,
        initialBalance: parsed.initialBalance,
        isDefault: false,
      })
      .returning();
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo crear la cuenta.' });
  }
});

// =============================================================================
// 8. SETTINGS, DEMO CLEANUP & BACKUP
// =============================================================================
const settingsSchema = z.object({
  businessName: z.string().min(1),
  city: z.string().min(1),
  initialCapital: z.number().min(0),
  targetProfitPerUnit: z.number().min(0),
  reinvestmentPercent: z.number().min(0).max(100),
  costAllocationMethod: z.enum(['proportional', 'equal']),
  valuationMethod: z.enum(['weighted_average', 'last_cost']),
  ivaRate: z.number().min(0).max(30),
  taxDocumentType: z.string().min(1),
  rutEmpresa: z.string().default(''),
  syncInitialAccount: z.boolean().optional(),
});

apiRouter.put('/settings', async (req: AuthRequest, res) => {
  try {
    const parsed = settingsSchema.parse(req.body);
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    const updated = await db.transaction(async (tx) => {
      const [upd] = await tx
        .update(businessSettings)
        .set({
          businessName: parsed.businessName.trim(),
          city: parsed.city.trim(),
          initialCapital: parsed.initialCapital,
          targetProfitPerUnit: parsed.targetProfitPerUnit,
          reinvestmentPercent: parsed.reinvestmentPercent,
          costAllocationMethod: parsed.costAllocationMethod,
          valuationMethod: parsed.valuationMethod,
          ivaRate: parsed.ivaRate,
          taxDocumentType: parsed.taxDocumentType,
          rutEmpresa: parsed.rutEmpresa.trim(),
          updatedAt: new Date(),
        })
        .where(eq(businessSettings.userId, userId))
        .returning();

      if (parsed.syncInitialAccount) {
        const userAccounts = await tx.select().from(accounts).where(eq(accounts.userId, userId));
        const def = userAccounts.find((a) => a.isDefault) || userAccounts[0];
        if (def) {
          await tx
            .update(accounts)
            .set({ initialBalance: parsed.initialCapital })
            .where(eq(accounts.id, def.id));
        }
      }

      await logAudit(tx, userId, 'settings', upd.id, 'update', 'Configuración comercial actualizada', email);
      return upd;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'No se pudo guardar la configuración.' });
  }
});

apiRouter.post('/demo/clear', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const email = req.dbUser!.email;

    await db.transaction(async (tx) => {
      await tx
        .delete(inventoryMovements)
        .where(and(eq(inventoryMovements.userId, userId), eq(inventoryMovements.isExample, true)));
      await tx
        .delete(products)
        .where(and(eq(products.userId, userId), eq(products.isExample, true)));
      await logAudit(tx, userId, 'system', null, 'clear_demo', 'Registros de ejemplo eliminados', email);
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'No se pudieron eliminar los registros de ejemplo.' });
  }
});

apiRouter.get('/backup', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [
      settingsRows,
      accountRows,
      supplierRows,
      productRows,
      variantRows,
      saleRows,
      poRows,
      expenseRows,
      txRows,
      movementRows,
    ] = await Promise.all([
      db.select().from(businessSettings).where(eq(businessSettings.userId, userId)),
      db.select().from(accounts).where(eq(accounts.userId, userId)),
      db.select().from(suppliers).where(eq(suppliers.userId, userId)),
      db.select().from(products).where(eq(products.userId, userId)),
      db.select().from(productVariants).where(eq(productVariants.userId, userId)),
      db.select().from(sales).where(eq(sales.userId, userId)),
      db.select().from(purchaseOrders).where(eq(purchaseOrders.userId, userId)),
      db.select().from(expenses).where(eq(expenses.userId, userId)),
      db.select().from(financialTransactions).where(eq(financialTransactions.userId, userId)),
      db.select().from(inventoryMovements).where(eq(inventoryMovements.userId, userId)),
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      business: settingsRows[0]?.businessName || 'DUNA ACTIVE',
      data: {
        settings: settingsRows[0] || null,
        accounts: accountRows,
        suppliers: supplierRows,
        products: productRows,
        variants: variantRows,
        sales: saleRows,
        purchaseOrders: poRows,
        expenses: expenseRows,
        transactions: txRows,
        movements: movementRows,
      },
    });
  } catch {
    res.status(500).json({ error: 'No se pudo generar el respaldo.' });
  }
});
