import type { AirtableRecord, Env, Json } from './types';

export class AirtableClient {
  constructor(private env: Env) {}

  private baseUrl(tableName: string): string {
    return `https://api.airtable.com/v0/${this.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  async list(tableName: string, params?: Record<string, string>): Promise<{ records: AirtableRecord[] }> {
    const url = new URL(this.baseUrl(tableName));
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), { headers: this.headers() });
    const body = await res.text();
    if (!res.ok) throw new Error(`Airtable list failed (${res.status}): ${body}`);
    return JSON.parse(body) as { records: AirtableRecord[] };
  }

  async findFirstByFormula(tableName: string, formula: string): Promise<AirtableRecord | null> {
    const data = await this.list(tableName, { filterByFormula: formula, maxRecords: '1' });
    return data.records[0] || null;
  }

  async create(tableName: string, fields: Record<string, Json>): Promise<AirtableRecord> {
    const res = await fetch(this.baseUrl(tableName), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ fields })
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Airtable create failed (${res.status}): ${body}`);
    return JSON.parse(body) as AirtableRecord;
  }

  async update(tableName: string, recordId: string, fields: Record<string, Json>): Promise<AirtableRecord> {
    const res = await fetch(`${this.baseUrl(tableName)}/${recordId}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ fields })
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Airtable update failed (${res.status}): ${body}`);
    return JSON.parse(body) as AirtableRecord;
  }

  async upsertByTextField(tableName: string, fieldName: string, value: string, fields: Record<string, Json>): Promise<{ action: 'created' | 'updated'; record: AirtableRecord }> {
    const formula = `{${fieldName}}="${escapeFormulaValue(value)}"`;
    const existing = await this.findFirstByFormula(tableName, formula);
    if (existing) {
      const updated = await this.update(tableName, existing.id, fields);
      return { action: 'updated', record: updated };
    }
    const created = await this.create(tableName, fields);
    return { action: 'created', record: created };
  }
}

export function escapeFormulaValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
