// Electricity reference data: the legacy default rates (MF 30, fixed ₹6,38,675 / month, energy ₹4.20 and fuel ₹2.30
// per kWh) as the first entry of each history; and in dev two weeks of twice-daily readings and two PGVCL bills.
import type { BillCharge, ElBill, ElRate, ElReading } from '../contracts/electricity';

type Ref<T> = Omit<T, 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export const REF_EL_RATES: Ref<ElRate>[] = [
  { id: 'elr-mf', kind: 'mf', value: 30, effectiveFrom: '2025-04-01' },
  { id: 'elr-fixed', kind: 'fixed', value: 63_867_500, effectiveFrom: '2025-04-01' },
  { id: 'elr-energy', kind: 'energy', value: 420, effectiveFrom: '2025-04-01' },
  { id: 'elr-fuel', kind: 'fuel', value: 230, effectiveFrom: '2025-04-01' },
];

/** 18 Sept – 1 Oct 2026, readings at 06:00 and 18:00, about 330–380 meter units a shift. */
export const DEMO_READINGS: Ref<ElReading>[] = (() => {
  const out: Ref<ElReading>[] = [];
  let kwh = 110_300;
  for (let d = 0; d < 14; d++) {
    const date = new Date(Date.UTC(2026, 8, 18 + d)).toISOString().slice(0, 10);
    for (const [shift, time] of [['AM', '06:00'], ['PM', '18:00']] as const) {
      kwh += 330 + ((d * 7 + (shift === 'PM' ? 3 : 0)) % 6) * 10;
      out.push({ id: `elm-${date}-${shift}`, date, shift, time, at: `${date}T${time}`, kwh, pf: Math.round((0.93 + ((d + (shift === 'PM' ? 1 : 0)) % 5) * 0.012) * 1000) / 1000, nightKwh: shift === 'AM' ? 140 + (d % 4) * 5 : null, remarks: null });
    }
  }
  return out;
})();

const charges = (c: Partial<Record<BillCharge, number>>): Record<BillCharge, number | null> => ({
  demand: null, energy: null, fuelSurcharge: null, pfRebate: null, nightRebate: null, ehvRebate: null, timeOfUse: null, gt: null, totalConsumption: null, electricityDuty: null, meterCharges: null, tcs: null,
  ...c,
});

/** Bills on the same meter: September's reading lines up with the demo readings (≈ 15,660 units × MF 30). */
export const DEMO_BILLS: Ref<ElBill>[] = [
  {
    id: 'elb-aug', billDate: '2026-08-31', dueDate: '2026-09-15', paidDate: '2026-09-10', advancePaymentPaise: null, kwhReading: 103_900, kvarhReading: 31_200, pf: 0.968, nightUnits: 4_100,
    charges: charges({ demand: 63_867_500, energy: 189_000_000, fuelSurcharge: 103_500_000, pfRebate: 1_900_000, nightRebate: 480_000, electricityDuty: 28_350_000, totalConsumption: 382_337_500 }),
    netPayablePaise: 382_337_500, totalPayablePaise: 382_337_500, remarks: null, invoice: null,
  },
  {
    id: 'elb-sep', billDate: '2026-09-30', dueDate: '2026-10-15', paidDate: null, advancePaymentPaise: null, kwhReading: 119_560, kvarhReading: 36_100, pf: 0.971, nightUnits: 4_250,
    charges: charges({ demand: 63_867_500, energy: 197_316_000, fuelSurcharge: 108_054_000, pfRebate: 2_000_000, nightRebate: 500_000, electricityDuty: 29_600_000, totalConsumption: 396_337_500 }),
    netPayablePaise: 396_337_500, totalPayablePaise: 396_337_500, remarks: null, invoice: null,
  },
];
