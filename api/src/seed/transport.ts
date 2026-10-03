import type { Transporter, VehicleType } from '../contracts/transport';

type Bare<T> = Omit<T, 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** Legacy VEHICLES. Same rows as db/migrations/0012_transport.sql. */
export const REF_VEHICLE_TYPES: Bare<VehicleType>[] = [
  { id: 'trv-lcv', name: 'LCV (1-2T)', description: 'Light Commercial Vehicle', capacity: '2 Ton', active: true },
  { id: 'trv-20ft', name: '20FT (5T)', description: '20 Foot Container Truck', capacity: '5 Ton', active: true },
  { id: 'trv-32ft', name: '32FT (10T)', description: '32 Foot Truck', capacity: '10 Ton', active: true },
  { id: 'trv-container', name: 'Container (22T)', description: 'ISO Container', capacity: '22 Ton', active: true },
  { id: 'trv-trailer', name: 'Trailer (25T)', description: 'Full Trailer', capacity: '25 Ton', active: true },
  { id: 'trv-open', name: 'Open Body', description: 'Open Flatbed Truck', capacity: 'Variable', active: true },
];

const tp = (o: Partial<Bare<Transporter>> & Pick<Transporter, 'id' | 'code' | 'name' | 'phone' | 'city'>): Bare<Transporter> => ({
  contactPerson: null, phone2: null, email: null, address: null, state: 'Gujarat', pincode: null, gstin: null, pan: null, tds: false, creditTerms: 'Against Delivery',
  ifsc: null, bankName: null, bankBranch: null, accountName: null, accountNo: null, vehicles: [], operatingCities: [], rating: 3, active: true, ...o,
});

/** DEV ONLY: the legacy module's sample transporters (made-up firms). */
export const DEMO_TRANSPORTERS: Bare<Transporter>[] = [
  tp({ id: 'trt-1', code: 'TRP-26-001', name: 'Gujarat Cargo Services', contactPerson: 'Mahesh Patel', phone: '9123456780', email: 'mahesh@gjcargo.com', address: 'Plot 14, Near GIDC, Naroda Road', city: 'Ahmedabad', pincode: '380006', gstin: '24AABCG1234F1Z5', pan: 'AABCG1234F', tds: true, ifsc: 'SBIN0001234', bankName: 'SBI', bankBranch: 'Naroda', accountName: 'Gujarat Cargo Services', accountNo: '001234567890', vehicles: ['LCV (1-2T)', '32FT (10T)', 'Container (22T)'], operatingCities: [{ city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' }, { city: 'Rajkot', state: 'Gujarat', pincode: '360001' }, { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }], rating: 4 }),
  tp({ id: 'trt-2', code: 'TRP-26-002', name: 'FastLine Logistics Pvt Ltd', contactPerson: 'Sunil Patel', phone: '9988001122', email: 'sunil@fastline.in', address: '12, Kathwada GIDC', city: 'Surat', pincode: '395003', gstin: '24AABCF5678G2H6', pan: 'AABCF5678G', creditTerms: '7 Days', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', bankBranch: 'Surat Main', accountName: 'FastLine Logistics Pvt Ltd', accountNo: '002345678901', vehicles: ['20FT (5T)', '32FT (10T)'], operatingCities: [{ city: 'Surat', state: 'Gujarat', pincode: '395001' }, { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }, { city: 'Pune', state: 'Maharashtra', pincode: '411001' }], rating: 5 }),
  tp({ id: 'trt-3', code: 'TRP-26-003', name: 'Nilgiri Transport Co.', contactPerson: 'Rajesh Nair', phone: '9876543210', email: 'rajesh@nilgiri.com', address: '18, Transport Nagar', city: 'Nagpur', state: 'Maharashtra', pincode: '440002', gstin: '27AABCN9012H3J7', pan: 'AABCN9012H', tds: true, creditTerms: '15 Days', ifsc: 'ICIC0001234', bankName: 'ICICI Bank', bankBranch: 'Nagpur', accountName: 'Nilgiri Transport Co.', accountNo: '003456789012', vehicles: ['Trailer (25T)', 'Container (22T)'], operatingCities: [{ city: 'Nagpur', state: 'Maharashtra', pincode: '440001' }, { city: 'New Delhi', state: 'Delhi', pincode: '110001' }], rating: 3 }),
  tp({ id: 'trt-4', code: 'TRP-26-004', name: 'Rapid Movers India', contactPerson: 'Kiran Shah', phone: '9012345678', phone2: '9012345679', email: 'kiran@rapidmovers.in', address: 'Opp Bus Stand, NH8', city: 'Vadodara', pincode: '390002', gstin: '24AABCR4321H1Z8', pan: 'AABCR4321H', creditTerms: '15 Days', ifsc: 'UTIB0001234', bankName: 'Axis Bank', bankBranch: 'Vadodara', accountName: 'Rapid Movers India', accountNo: '004567890123', vehicles: ['20FT (5T)', '32FT (10T)', 'Open Body'], operatingCities: [{ city: 'Vadodara', state: 'Gujarat', pincode: '390001' }, { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }, { city: 'Rajkot', state: 'Gujarat', pincode: '360001' }], rating: 4 }),
];
