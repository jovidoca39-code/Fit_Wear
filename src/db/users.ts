import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  accounts,
  businessSettings,
  inventoryMovements,
  products,
  productVariants,
  suppliers,
  users,
} from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName = '') {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName,
        role: 'admin',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
        },
      })
      .returning();

    const user = result[0];
    await ensureWorkspaceInitialized(user.id, user.email);
    return user;
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('No se pudo sincronizar la cuenta de usuario.', { cause: error });
  }
}

export async function ensureWorkspaceInitialized(userId: number, userEmail: string) {
  try {
    const existingSettings = await db
      .select()
      .from(businessSettings)
      .where(eq(businessSettings.userId, userId));

    if (existingSettings.length > 0) {
      return;
    }

    await db.transaction(async (tx) => {
      const checkAgain = await tx
        .select()
        .from(businessSettings)
        .where(eq(businessSettings.userId, userId));
      if (checkAgain.length > 0) return;

      await tx.insert(businessSettings).values({
        userId,
        businessName: 'DUNA ACTIVE',
        city: 'Antofagasta, Chile',
        currency: 'CLP',
        timezone: 'America/Santiago',
        initialCapital: 116724,
        targetProfitPerUnit: 10000,
        reinvestmentPercent: 70,
        costAllocationMethod: 'proportional',
        valuationMethod: 'weighted_average',
        ivaRate: 19,
        taxDocumentType: 'Boleta Electrónica',
      });

      await tx.insert(accounts).values([
        {
          userId,
          name: 'Cuenta Principal (Banco)',
          type: 'banco',
          initialBalance: 116724,
          isDefault: true,
        },
        {
          userId,
          name: 'Caja Efectivo Antofagasta',
          type: 'efectivo',
          initialBalance: 0,
          isDefault: false,
        },
        {
          userId,
          name: 'Mercado Pago / Tarjetas',
          type: 'digital',
          initialBalance: 0,
          isDefault: false,
        },
      ]);

      const insertedSuppliers = await tx
        .insert(suppliers)
        .values([
          {
            userId,
            name: 'SHEIN',
            country: 'China / Internacional',
            city: 'Guangzhou',
            website: 'https://cl.shein.com',
            whatsapp: '',
            email: '',
            address: 'Envío directo a Antofagasta',
            productsSupplied: 'Calzas seamless deportivas, tops fitness, conjuntos',
            minOrderQty: 1,
            avgLeadDays: 14,
            shippingCostEstimate: 0,
            rating: 5,
            notes: 'Proveedor principal para líneas Seamless y Velisys.',
            isExample: false,
          },
          {
            userId,
            name: 'Alibaba',
            country: 'China',
            city: 'Yiwu / Hangzhou',
            website: 'https://www.alibaba.com',
            whatsapp: '',
            email: '',
            address: 'Importación mayorista',
            productsSupplied: 'Lotes mayoristas de calzas de compresión y marca propia',
            minOrderQty: 20,
            avgLeadDays: 25,
            shippingCostEstimate: 35000,
            rating: 4,
            notes: 'Ideal para escalar volumen y personalización de marca DUNA ACTIVE.',
            isExample: false,
          },
          {
            userId,
            name: 'Patronato por Mayor',
            country: 'Chile',
            city: 'Santiago',
            website: '',
            whatsapp: '',
            email: '',
            address: 'Barrio Patronato, Recoleta',
            productsSupplied: 'Calzas deportivas, poleras dry-fit, accesorios fitness',
            minOrderQty: 6,
            avgLeadDays: 4,
            shippingCostEstimate: 8500,
            rating: 4,
            notes: 'Reposición rápida nacional vía Starken / Chilexpress a Antofagasta.',
            isExample: false,
          },
          {
            userId,
            name: 'Proveedores Nacionales Chile',
            country: 'Chile',
            city: 'Antofagasta / Santiago',
            website: '',
            whatsapp: '',
            email: '',
            address: 'Despacho nacional',
            productsSupplied: 'Packaging, bolsas ecológicas, etiquetas, ropa fitness nacional',
            minOrderQty: 1,
            avgLeadDays: 3,
            shippingCostEstimate: 5000,
            rating: 5,
            notes: 'Insumos de empaque y reposición express.',
            isExample: false,
          },
        ])
        .returning();

      const sheinSupplier = insertedSuppliers.find((s) => s.name === 'SHEIN');
      const todayChile = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
      }).format(new Date());

      // Seed clearly-marked example products requested in Section 15
      const [calzaShein] = await tx
        .insert(products)
        .values({
          userId,
          sku: 'DUNA-CLZ-001',
          name: 'Calza SHEIN Sports Seamless',
          category: 'Calzas',
          brand: 'SHEIN Sports',
          model: 'Seamless High Waist',
          description:
            'Calza deportiva sin costuras de cintura alta, tejido compresivo transpirable. Registro de ejemplo inicial.',
          supplierId: sheinSupplier?.id ?? null,
          purchaseDate: todayChile,
          purchasePrice: 5703,
          salePrice: 15703,
          location: 'Bodega Antofagasta - Estante A1',
          mainPhoto: '/src/assets/images/calza_shein_burdeos_1795654756488.jpg',
          galleryPhotos: ['/src/assets/images/calza_shein_burdeos_1795654756488.jpg'],
          isPack: false,
          packUnits: 1,
          allowSingleUnitSale: true,
          packComposition: '',
          singleUnitSalePrice: 15703,
          isActive: true,
          isExample: true,
        })
        .returning();

      const calzaVariants = await tx
        .insert(productVariants)
        .values([
          {
            userId,
            productId: calzaShein.id,
            skuVariant: 'DUNA-CLZ-001-BUR-S',
            size: 'S',
            color: 'Burdeos',
            stock: 2,
            reservedStock: 0,
            minStock: 2,
            unitCost: 5703,
          },
          {
            userId,
            productId: calzaShein.id,
            skuVariant: 'DUNA-CLZ-001-BUR-M',
            size: 'M',
            color: 'Burdeos',
            stock: 2,
            reservedStock: 0,
            minStock: 2,
            unitCost: 5703,
          },
          {
            userId,
            productId: calzaShein.id,
            skuVariant: 'DUNA-CLZ-001-BUR-L',
            size: 'L',
            color: 'Burdeos',
            stock: 2,
            reservedStock: 0,
            minStock: 2,
            unitCost: 5703,
          },
        ])
        .returning();

      const [packVelisys] = await tx
        .insert(products)
        .values({
          userId,
          sku: 'DUNA-PCK-002',
          name: 'Pack Velisys 2 Calzas',
          category: 'Packs',
          brand: 'Velisys',
          model: 'Pack x2 Seamless',
          description:
            'Pack compuesto por 2 calzas deportivas (1 Negro + 1 Grafito). Costo pack $12.035 ($6.017,50 por unidad). Permite venta en pack o por unidad sin duplicar stock.',
          supplierId: sheinSupplier?.id ?? null,
          purchaseDate: todayChile,
          purchasePrice: 12035,
          salePrice: 32035,
          location: 'Bodega Antofagasta - Estante A2',
          mainPhoto: '/src/assets/images/pack_velisys_calzas_1795654757719.jpg',
          galleryPhotos: ['/src/assets/images/pack_velisys_calzas_1795654757719.jpg'],
          isPack: true,
          packUnits: 2,
          allowSingleUnitSale: true,
          packComposition: '2 calzas deportivas Seamless (Negro + Grafito)',
          singleUnitSalePrice: 16018,
          isActive: true,
          isExample: true,
        })
        .returning();

      const packVariants = await tx
        .insert(productVariants)
        .values([
          {
            userId,
            productId: packVelisys.id,
            skuVariant: 'DUNA-PCK-002-NG-S',
            size: 'S',
            color: 'Negro / Grafito',
            stock: 4, // 2 packs = 4 prendas físicas
            reservedStock: 0,
            minStock: 2,
            unitCost: 6017.5,
          },
          {
            userId,
            productId: packVelisys.id,
            skuVariant: 'DUNA-PCK-002-NG-M',
            size: 'M',
            color: 'Negro / Grafito',
            stock: 4,
            reservedStock: 0,
            minStock: 2,
            unitCost: 6017.5,
          },
          {
            userId,
            productId: packVelisys.id,
            skuVariant: 'DUNA-PCK-002-NG-L',
            size: 'L',
            color: 'Negro / Grafito',
            stock: 4,
            reservedStock: 0,
            minStock: 2,
            unitCost: 6017.5,
          },
        ])
        .returning();

      const movementRows = [
        ...calzaVariants.map((v) => ({
          userId,
          productId: calzaShein.id,
          variantId: v.id,
          movementType: 'stock_inicial',
          quantityChange: v.stock,
          previousStock: 0,
          newStock: v.stock,
          unitCost: v.unitCost,
          referenceType: 'manual',
          reason: 'Stock inicial de ejemplo (Calza SHEIN Sports Seamless)',
          performedBy: userEmail || 'sistema',
          isExample: true,
        })),
        ...packVariants.map((v) => ({
          userId,
          productId: packVelisys.id,
          variantId: v.id,
          movementType: 'stock_inicial',
          quantityChange: v.stock,
          previousStock: 0,
          newStock: v.stock,
          unitCost: v.unitCost,
          referenceType: 'manual',
          reason: 'Stock inicial de ejemplo (2 packs = 4 calzas físicas Velisys)',
          performedBy: userEmail || 'sistema',
          isExample: true,
        })),
      ];

      await tx.insert(inventoryMovements).values(movementRows);
    });
  } catch (error) {
    console.error('Error initializing workspace:', error);
    throw new Error('Error al inicializar el espacio de trabajo DUNA ACTIVE.', { cause: error });
  }
}
