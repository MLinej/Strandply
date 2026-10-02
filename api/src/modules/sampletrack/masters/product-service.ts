import {
  BOARD_TYPES,
  STOCK_STATUSES,
  type ImportReport,
  type Product,
  type ProductFilters,
  type ProductSummary,
} from '../../../contracts/sampletrack';
import { conflict, notFound } from '../../../lib/errors';
import { isoNow, type Clock } from '../../../lib/clock';
import { newId } from '../../../lib/crypto';
import { readFirstSheet, writeXlsx, type Column } from '../../../lib/spreadsheet';
import { UniqueViolationError, type DataLayer, type ListQuery, type ProductPatch } from '../../../repos';
import type { ActivityService } from '../activity-service';
import type { Actor } from '../actor';
import { assertNotInUse, changedKeys, collectAll, rupees } from './common';
import { planImport } from './product-import';
import type { ProductCreate, ProductUpdate } from './validation';

const EXPORT_COLUMNS: Column<Product>[] = [
  { header: 'Product Code', value: (p) => p.code },
  { header: 'Product Name', value: (p) => p.name },
  { header: 'Board Type', value: (p) => p.boardType },
  { header: 'Thickness (mm)', value: (p) => p.thicknessMm },
  { header: 'Size', value: (p) => p.size },
  { header: 'Category', value: (p) => p.category },
  { header: 'Unit Price (₹)', value: (p) => rupees(p.unitPricePaise) },
  { header: 'Stock Status', value: (p) => p.stockStatus },
  { header: 'Description', value: (p) => p.description },
  { header: 'Created At (UTC)', value: (p) => p.createdAt },
  { header: 'Updated At (UTC)', value: (p) => p.updatedAt },
];

type TemplateRow = { code: string; name: string; board: string; thick: number; size: string; cat: string; price: number; stock: string };

export class ProductService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  list(query: ListQuery<ProductFilters>) {
    return this.data.repos.products.list(query);
  }

  async get(id: string): Promise<Product> {
    const p = await this.data.repos.products.getById(id);
    if (!p) throw notFound('Product');
    return p;
  }

  async summary(): Promise<ProductSummary> {
    const counts = new Map((await this.data.repos.products.countByBoardType()).map((c) => [c.boardType, c.count]));
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const osb = counts.get('OSB') ?? 0;
    const sosb = counts.get('S-OSB') ?? 0;
    const mdo = counts.get('MDO') ?? 0;
    return { total, osb, sosb, mdo, others: total - osb - sosb - mdo };
  }

  async create(actor: Actor, input: ProductCreate): Promise<Product> {
    const at = isoNow(this.clock);
    return this.uniqueCode(() =>
      this.data.uow.run(async (tx) => {
        const product = await tx.products.create({
          id: newId(),
          code: input.code,
          name: input.name,
          boardType: input.boardType,
          thicknessMm: input.thicknessMm ?? null,
          size: input.size ?? null,
          category: input.category ?? null,
          unitPricePaise: input.unitPricePaise,
          stockStatus: input.stockStatus,
          description: input.description ?? null,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, {
          action: 'Create',
          entityType: 'product',
          entityId: product.id,
          details: `Created product ${product.code} ${product.name}`,
        });
        return product;
      }),
    );
  }

  async update(actor: Actor, id: string, input: ProductUpdate): Promise<Product> {
    return this.uniqueCode(() =>
      this.data.uow.run(async (tx) => {
        const before = await tx.products.getById(id);
        if (!before) throw notFound('Product');
        const changed = changedKeys(before, input as Partial<Product>);
        if (!changed.length) return before;
        const patch = Object.fromEntries(changed.map((k) => [k, (input as Record<string, unknown>)[k]]));
        const updated = (await tx.products.update(id, { ...patch, updatedAt: isoNow(this.clock) } as ProductPatch))!;
        await this.activity.record(tx, actor, {
          action: 'Edit',
          entityType: 'product',
          entityId: id,
          details: `Updated product ${updated.code}: ${changed.join(', ')}`,
        });
        return updated;
      }),
    );
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const product = await tx.products.getById(id);
      if (!product) throw notFound('Product');
      // TODO(d1): guarded soft delete (… WHERE NOT EXISTS live request item) in the same batch.
      assertNotInUse('Product', product.name, await tx.usage.product(id));
      await tx.products.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, {
        action: 'Delete',
        entityType: 'product',
        entityId: id,
        details: `Deleted product ${product.code} ${product.name}`,
      });
    });
  }

  async exportXlsx(actor: Actor, query: ListQuery<ProductFilters>): Promise<Uint8Array> {
    const rows = await collectAll((q) => this.data.repos.products.list(q), query);
    const bytes = writeXlsx([{ name: 'Products', columns: EXPORT_COLUMNS, rows }]);
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Export', entityType: 'product', details: `Exported ${rows.length} products` }),
    );
    return bytes;
  }

  /** Blank import file: the headers, two example rows, and a sheet listing the allowed values. */
  template(): Uint8Array {
    const examples: TemplateRow[] = [
      { code: 'OSB-12-8X4', name: 'OSB 12mm Standard', board: 'OSB', thick: 12, size: '8x4 ft', cat: 'Standard', price: 850, stock: 'Available' },
      { code: 'SOSB-15-8X4', name: 'S-OSB 15mm', board: 'S-OSB', thick: 15, size: '8x4 ft', cat: 'Standard', price: 1050, stock: 'Available' },
    ];
    const allowed = Array.from({ length: Math.max(BOARD_TYPES.length, STOCK_STATUSES.length) }, (_, i) => i);
    return writeXlsx([
      {
        name: 'Products',
        rows: examples,
        columns: [
          { header: 'Product Code', value: (r: TemplateRow) => r.code },
          { header: 'Product Name', value: (r: TemplateRow) => r.name },
          { header: 'Board Type', value: (r: TemplateRow) => r.board },
          { header: 'Thickness (mm)', value: (r: TemplateRow) => r.thick },
          { header: 'Size', value: (r: TemplateRow) => r.size },
          { header: 'Category', value: (r: TemplateRow) => r.cat },
          { header: 'Unit Price (₹)', value: (r: TemplateRow) => r.price },
          { header: 'Stock Status', value: (r: TemplateRow) => r.stock },
        ],
      },
      {
        name: 'Allowed values',
        rows: allowed,
        columns: [
          { header: 'Board Type', value: (i: number) => BOARD_TYPES[i] },
          { header: 'Stock Status', value: (i: number) => STOCK_STATUSES[i] },
        ],
      },
    ]);
  }

  /**
   * Import from .xlsx/.xls/.csv. A preview writes nothing. A commit re-plans inside one unit of work
   * (so it sees the data as of now), then adds every valid row together and logs one Import entry.
   */
  async import(actor: Actor, bytes: Uint8Array, opts: { commit: boolean; fileName: string }): Promise<ImportReport> {
    const sheet = readFirstSheet(bytes);
    const report = (plan: ReturnType<typeof planImport>, mode: ImportReport['mode']): ImportReport => {
      const count = (s: string) => plan.rows.filter((r) => r.status === s).length;
      return {
        mode,
        columns: plan.columns,
        rows: plan.rows,
        totals: {
          rows: plan.rows.length,
          added: count(mode === 'commit' ? 'added' : 'would_add'),
          skipped: count('skipped'),
          errors: count('error'),
        },
      };
    };

    if (!opts.commit) return report(planImport(sheet, await this.data.repos.products.listKeys()), 'preview');

    return this.data.uow.run(async (tx) => {
      const plan = planImport(sheet, await tx.products.listKeys());
      const at = isoNow(this.clock);
      for (const r of plan.rows) {
        if (r.status !== 'would_add' || !r.product) continue;
        const p = r.product;
        await tx.products.create({
          id: newId(),
          code: p.code,
          name: p.name,
          boardType: p.boardType ?? 'OSB',
          thicknessMm: p.thicknessMm ?? null,
          size: p.size ?? null,
          category: p.category ?? null,
          unitPricePaise: p.unitPricePaise ?? 0,
          stockStatus: p.stockStatus ?? 'Available',
          description: null,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        r.status = 'added';
      }
      const result = report(plan, 'commit');
      await this.activity.record(tx, actor, {
        action: 'Import',
        entityType: 'product',
        details: `Imported ${result.totals.added} products from ${opts.fileName} (${result.totals.skipped} skipped, ${result.totals.errors} errors)`,
      });
      return result;
    });
  }

  private async uniqueCode<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UniqueViolationError && err.field === 'code') {
        throw conflict('code_taken', 'Another product already uses that code');
      }
      throw err;
    }
  }
}
