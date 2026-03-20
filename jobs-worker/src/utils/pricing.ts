export type NormalizedPricing = {
  base_price_thb: number;
  addon_1_name: string;
  addon_1_price_thb: number;
  addon_2_name: string;
  addon_2_price_thb: number;
  addon_3_name: string;
  addon_3_price_thb: number;
  addon_4_name: string;
  addon_4_price_thb: number;
  addons_total_thb: number;
  final_price_thb: number;
  amount_thb: number;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function normalizePricing(input: any): NormalizedPricing {
  const base_price_thb = toNum(input.base_price_thb) || toNum(input.course_thb);

  const addon_1_name = toStr(input.addon_1_name) || toStr(input.opt1);
  const addon_1_price_thb = toNum(input.addon_1_price_thb) || toNum(input.ext1_thb);

  const addon_2_name = toStr(input.addon_2_name) || toStr(input.opt2);
  const addon_2_price_thb = toNum(input.addon_2_price_thb) || toNum(input.ext2_thb);

  const addon_3_name = toStr(input.addon_3_name) || toStr(input.opt3);
  const addon_3_price_thb = toNum(input.addon_3_price_thb) || toNum(input.ext3_thb);

  const addon_4_name = toStr(input.addon_4_name) || toStr(input.opt4);
  const addon_4_price_thb = toNum(input.addon_4_price_thb) || toNum(input.ext4_thb);

  const addons_total_thb =
    addon_1_price_thb +
    addon_2_price_thb +
    addon_3_price_thb +
    addon_4_price_thb;

  const final_price_thb = base_price_thb + addons_total_thb;

  return {
    base_price_thb,
    addon_1_name,
    addon_1_price_thb,
    addon_2_name,
    addon_2_price_thb,
    addon_3_name,
    addon_3_price_thb,
    addon_4_name,
    addon_4_price_thb,
    addons_total_thb,
    final_price_thb,
    amount_thb: final_price_thb,
  };
}
