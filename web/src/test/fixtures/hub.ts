// Hub responses captured from the dev API (lists trimmed), with a production sample added.
export const hub = {
 "period": {
  "from": "2026-09-01",
  "to": "2026-09-30",
  "purchase": {
   "entries": 0,
   "valuePaise": 0,
   "vendors": 0,
   "pendingEntries": 0,
   "byMaterial": [],
   "byMonth": [],
   "topVendors": [],
   "recent": []
  },
  "production": {
   "reports": 3,
   "boards": 1260,
   "byMonth": [
    {
     "month": "2026-09",
     "value": 1260
    }
   ],
   "byProduct": [
    {
     "product": "18 mm OSB",
     "reports": 2,
     "boards": 840
    },
    {
     "product": "12 mm OSB",
     "reports": 1,
     "boards": 420
    }
   ],
   "byShift": [
    {
     "name": "Day",
     "value": 840
    },
    {
     "name": "Night",
     "value": 420
    }
   ]
  },
  "electricity": {
   "bills": 1,
   "billedUnits": 469800,
   "billedPaise": 396337500,
   "meteredUnits": 266400,
   "meteredPaise": 200835921,
   "byMonth": [
    {
     "month": "2026-09",
     "billedPaise": 396337500,
     "meteredUnits": 266400,
     "meteredPaise": 200835921
    }
   ],
   "billList": [
    {
     "id": "elb-sep",
     "billDate": "2026-09-30",
     "dueDate": "2026-10-15",
     "paidDate": null,
     "units": 469800,
     "totalPaise": 396337500
    }
   ],
   "readings": 26
  },
  "sales": {
   "invoices": 0,
   "revenuePaise": 0,
   "tons": 0,
   "pendingApproval": 0,
   "byMonth": [],
   "topCustomers": [],
   "byFirm": [],
   "pendingOrders": [
    {
     "soNo": "SO/41/26-27",
     "firm": "llp",
     "date": "2026-05-02",
     "party": "SRIDARSHAN PACKAGING INDUSTRIES",
     "status": "Confirmed",
     "tons": 17.82,
     "valuePaise": 74499312
    },
    {
     "soNo": "SO/66/26-27",
     "firm": "llp",
     "date": "2026-06-16",
     "party": "PB LUXURY SALONS LLP",
     "status": "Confirmed",
     "tons": 2.32,
     "valuePaise": 14348717
    },
    {
     "soNo": "SO/56/26-27",
     "firm": "llp",
     "date": "2026-05-26",
     "party": "MEHTA TUBES LTD.",
     "status": "Confirmed",
     "tons": 1.08,
     "valuePaise": 3005258
    },
    {
     "soNo": "SO/62/26-27",
     "firm": "llp",
     "date": "2026-06-09",
     "party": "NEW AKTA AGENCY",
     "status": "Confirmed",
     "tons": 10.84,
     "valuePaise": 0
    }
   ],
   "pendingPaise": 91853287,
   "pendingTons": 32.06,
   "pipeline": [
    {
     "status": "Confirmed",
     "orders": 4,
     "valuePaise": 91853287
    },
    {
     "status": "Completed",
     "orders": 56,
     "valuePaise": 1421441397
    },
    {
     "status": "Cancelled",
     "orders": 5,
     "valuePaise": 77467417
    }
   ],
   "recent": []
  },
  "maintenance": {
   "workOrders": 5,
   "open": 4,
   "overdue": 2,
   "completed": 1,
   "byCategory": [
    {
     "name": "Civil",
     "value": 1
    },
    {
     "name": "Electrical",
     "value": 1
    },
    {
     "name": "Hydraulic",
     "value": 1
    },
    {
     "name": "Mechanical",
     "value": 1
    },
    {
     "name": "Pneumatic",
     "value": 1
    }
   ],
   "byPriority": [
    {
     "name": "Critical",
     "value": 2
    },
    {
     "name": "High",
     "value": 1
    },
    {
     "name": "Low",
     "value": 1
    },
    {
     "name": "Medium",
     "value": 1
    }
   ],
   "openList": [
    {
     "id": "wo-3",
     "woNo": "WO-26-0003",
     "title": "Panel PLC Fault \u2014 Line B",
     "category": "Electrical",
     "priority": "Critical",
     "assignee": "Suresh Yadav",
     "dueDate": "2026-09-27",
     "status": "Open",
     "overdue": true
    },
    {
     "id": "wo-1",
     "woNo": "WO-26-0001",
     "title": "Hydraulic Press #3 Oil Leak",
     "category": "Hydraulic",
     "priority": "Critical",
     "assignee": "Raj Kumar",
     "dueDate": "2026-09-28",
     "status": "In Progress",
     "overdue": true
    },
    {
     "id": "wo-2",
     "woNo": "WO-26-0002",
     "title": "Conveyor Belt Motor Bearing Noise",
     "category": "Mechanical",
     "priority": "High",
     "assignee": "Priya Nair",
     "dueDate": "2026-10-06",
     "status": "Open",
     "overdue": false
    },
    {
     "id": "wo-4",
     "woNo": "WO-26-0004",
     "title": "Air Compressor Pressure Drop",
     "category": "Pneumatic",
     "priority": "Medium",
     "assignee": "Meena Das",
     "dueDate": "2026-10-09",
     "status": "On Hold",
     "overdue": false
    }
   ]
  },
  "others": {
   "complaints": 3,
   "complaintsOpen": 2,
   "freightOrders": 0,
   "freightPaise": 0,
   "plans": 2,
   "plansAchievedPct": 86
  }
 },
 "analytics": {
  "costPaise": 1017283509,
  "boards": 0,
  "costPerBoardPaise": null,
  "kwhPerThousand": null,
  "rawShare": 79,
  "byMonth": [
   {
    "month": "2026-04",
    "boards": 0,
    "rawPaise": 419599196,
    "powerPaise": 0,
    "units": 0,
    "costPerBoardPaise": null,
    "kwhPerThousand": null
   },
   {
    "month": "2026-05",
    "boards": 0,
    "rawPaise": 380874475,
    "powerPaise": 0,
    "units": 0,
    "costPerBoardPaise": null,
    "kwhPerThousand": null
   },
   {
    "month": "2026-08",
    "boards": 0,
    "rawPaise": 0,
    "powerPaise": 0,
    "units": 0,
    "costPerBoardPaise": null,
    "kwhPerThousand": null
   },
   {
    "month": "2026-09",
    "boards": 0,
    "rawPaise": 0,
    "powerPaise": 200835921,
    "units": 266400,
    "costPerBoardPaise": null,
    "kwhPerThousand": null
   },
   {
    "month": "2026-10",
    "boards": 0,
    "rawPaise": 0,
    "powerPaise": 15973917,
    "units": 21300,
    "costPerBoardPaise": null,
    "kwhPerThousand": null
   }
  ]
 },
 "stock": {
  "fy": "2026-27",
  "raw": [
   {
    "material": "nilgiri",
    "label": "Nilgiri Wood",
    "unit": "Kg",
    "openQty": 0,
    "purchQty": 426615,
    "consumeQty": 0,
    "closingQty": 426615,
    "closingPaise": 311219500
   },
   {
    "material": "resin",
    "label": "Resin",
    "unit": "Kg",
    "openQty": 0,
    "purchQty": 67410,
    "consumeQty": 0,
    "closingQty": 67410,
    "closingPaise": 269640000
   },
   {
    "material": "kraft",
    "label": "Kraft Paper",
    "unit": "Pcs",
    "openQty": 0,
    "purchQty": 11365,
    "consumeQty": 0,
    "closingQty": 11365,
    "closingPaise": 37025000
   },
   {
    "material": "firewood",
    "label": "Fire Wood",
    "unit": "Kg",
    "openQty": 0,
    "purchQty": 0,
    "consumeQty": 0,
    "closingQty": 0,
    "closingPaise": 0
   },
   {
    "material": "core",
    "label": "Core Veneer",
    "unit": "Pcs",
    "openQty": 0,
    "purchQty": 28273,
    "consumeQty": 0,
    "closingQty": 28273,
    "closingPaise": 71940633
   },
   {
    "material": "face",
    "label": "Face Veneer",
    "unit": "Sq Mtr",
    "openQty": 0,
    "purchQty": 0,
    "consumeQty": 0,
    "closingQty": 0,
    "closingPaise": 0
   }
  ],
  "rawClosingPaise": 689825133,
  "sku": []
 },
 "purchase": {
  "entries": 70,
  "valuePaise": 800473671,
  "vendors": 10,
  "pendingEntries": 29,
  "byMaterial": [
   {
    "material": "nilgiri",
    "label": "Nilgiri Wood",
    "unit": "Kg",
    "entries": 54,
    "qty": 426615,
    "valuePaise": 352719024
   },
   {
    "material": "kraft",
    "label": "Kraft Paper",
    "unit": "Pcs",
    "entries": 7,
    "qty": 11365,
    "valuePaise": 44689500
   },
   {
    "material": "core",
    "label": "Core Veneer",
    "unit": "Pcs",
    "entries": 4,
    "qty": 28273,
    "valuePaise": 84889947
   },
   {
    "material": "resin",
    "label": "Resin",
    "unit": "Kg",
    "entries": 5,
    "qty": 67410,
    "valuePaise": 318175200
   }
  ],
  "byMonth": [
   {
    "month": "2026-04",
    "value": 419599196
   },
   {
    "month": "2026-05",
    "value": 380874475
   }
  ],
  "topVendors": [
   {
    "name": "V.K.Industrioes",
    "value": 362864700
   },
   {
    "name": "Panchanand Timber Industries (5%)",
    "value": 107350034
   },
   {
    "name": "TM NILGIRI SUPPLIER",
    "value": 96551386
   },
   {
    "name": "ROHIT RAVJIBHAI AHIR",
    "value": 74534700
   },
   {
    "name": "Universal Wood Veneer",
    "value": 69580155
   },
   {
    "name": "TM Nilgiri Supplier",
    "value": 34824754
   }
  ],
  "recent": [
   {
    "id": "pe-nilgiri-54",
    "date": "2026-05-28",
    "material": "Nilgiri Wood",
    "vendor": "ROHIT RAVJIBHAI AHIR",
    "invoiceNo": "RRA-008",
    "qty": 19570,
    "unit": "Kg",
    "valuePaise": 14286100
   },
   {
    "id": "pe-nilgiri-53",
    "date": "2026-05-26",
    "material": "Nilgiri Wood",
    "vendor": "ROHIT RAVJIBHAI AHIR",
    "invoiceNo": "RRA-007",
    "qty": 15115,
    "unit": "Kg",
    "valuePaise": 11033950
   },
   {
    "id": "pe-resin-5",
    "date": "2026-05-26",
    "material": "Resin",
    "vendor": "V.K.Industrioes",
    "invoiceNo": "VK/164",
    "qty": 9460,
    "unit": "Kg",
    "valuePaise": 44651200
   },
   {
    "id": "pe-nilgiri-52",
    "date": "2026-05-25",
    "material": "Nilgiri Wood",
    "vendor": "ROHIT RAVJIBHAI AHIR",
    "invoiceNo": "RRA-006",
    "qty": 15690,
    "unit": "Kg",
    "valuePaise": 11453700
   },
   {
    "id": "pe-resin-4",
    "date": "2026-05-22",
    "material": "Resin",
    "vendor": "V.K.Industrioes",
    "invoiceNo": "VK/146",
    "qty": 2530,
    "unit": "Kg",
    "valuePaise": 11941600
   },
   {
    "id": "pe-nilgiri-51",
    "date": "2026-05-20",
    "material": "Nilgiri Wood",
    "vendor": "TM Nilgiri Supplier (5%)",
    "invoiceNo": "GT/40/26-27",
    "qty": 6780,
    "unit": "Kg",
    "valuePaise": 6000300
   }
  ]
 },
 "sources": [
  {
   "module": "Purchase",
   "page": "/purchase/register",
   "records": 70,
   "label": "purchase entries",
   "updatedAt": "2026-05-28T10:00:00.000Z"
  },
  {
   "module": "Production",
   "page": "/production/hot-press",
   "records": 0,
   "label": "hot press and chipping reports",
   "updatedAt": null
  },
  {
   "module": "Stock (SKU)",
   "page": "/stock/live",
   "records": 0,
   "label": "stock slips",
   "updatedAt": null
  },
  {
   "module": "Electricity",
   "page": "/electricity/readings",
   "records": 30,
   "label": "meter readings and bills",
   "updatedAt": "2026-10-05T14:24:19.301Z"
  },
  {
   "module": "Sales",
   "page": "/sales/invoices",
   "records": 122,
   "label": "invoices and sales orders",
   "updatedAt": "2026-10-03T05:37:50.534Z"
  },
  {
   "module": "Maintenance",
   "page": "/maintenance/work-orders",
   "records": 5,
   "label": "work orders",
   "updatedAt": "2026-09-27T02:15:00.000Z"
  },
  {
   "module": "Complaints",
   "page": "/complaints/register",
   "records": 3,
   "label": "complaints",
   "updatedAt": "2026-09-30T10:00:00.000Z"
  },
  {
   "module": "Transport",
   "page": "/transport/inquiries",
   "records": 0,
   "label": "freight inquiries",
   "updatedAt": null
  },
  {
   "module": "DWPAS",
   "page": "/dwpas/register",
   "records": 3,
   "label": "work plans",
   "updatedAt": "2026-10-05T14:24:19.301Z"
  },
  {
   "module": "CRM",
   "page": "/crm/leads",
   "records": 7,
   "label": "leads",
   "updatedAt": "2026-10-03T10:00:00.398Z"
  }
 ],
 "sales": {
  "invoices": 57,
  "revenuePaise": 1430172777,
  "tons": 275.75,
  "pendingApproval": 57,
  "byMonth": [
   {
    "month": "2026-04",
    "value": 863723002
   },
   {
    "month": "2026-05",
    "value": 293906729
   },
   {
    "month": "2026-06",
    "value": 272543046
   }
  ],
  "topCustomers": [
   {
    "name": "SEAWORTHY PACK TECH PVT LTD",
    "value": 380886245
   },
   {
    "name": "OASIS INTERIOR HUB",
    "value": 297465309
   },
   {
    "name": "KPAC",
    "value": 99066950
   },
   {
    "name": "NEW AKTA AGENCY",
    "value": 92948945
   },
   {
    "name": "S K DECOR",
    "value": 65885455
   },
   {
    "name": "WALLGREENS PANELS PVT LTD",
    "value": 57093085
   }
  ],
  "byFirm": [
   {
    "name": "LLP",
    "value": 1430172777
   }
  ],
  "pendingOrders": [
   {
    "soNo": "SO/41/26-27",
    "firm": "llp",
    "date": "2026-05-02",
    "party": "SRIDARSHAN PACKAGING INDUSTRIES",
    "status": "Confirmed",
    "tons": 17.82,
    "valuePaise": 74499312
   },
   {
    "soNo": "SO/66/26-27",
    "firm": "llp",
    "date": "2026-06-16",
    "party": "PB LUXURY SALONS LLP",
    "status": "Confirmed",
    "tons": 2.32,
    "valuePaise": 14348717
   },
   {
    "soNo": "SO/56/26-27",
    "firm": "llp",
    "date": "2026-05-26",
    "party": "MEHTA TUBES LTD.",
    "status": "Confirmed",
    "tons": 1.08,
    "valuePaise": 3005258
   },
   {
    "soNo": "SO/62/26-27",
    "firm": "llp",
    "date": "2026-06-09",
    "party": "NEW AKTA AGENCY",
    "status": "Confirmed",
    "tons": 10.84,
    "valuePaise": 0
   }
  ],
  "pendingPaise": 91853287,
  "pendingTons": 32.06,
  "pipeline": [
   {
    "status": "Confirmed",
    "orders": 4,
    "valuePaise": 91853287
   },
   {
    "status": "Completed",
    "orders": 56,
    "valuePaise": 1421441397
   },
   {
    "status": "Cancelled",
    "orders": 5,
    "valuePaise": 77467417
   }
  ],
  "recent": [
   {
    "id": "sli-inv-57",
    "invNo": "SPL/074/26-27",
    "date": "2026-06-17",
    "firm": "llp",
    "party": "V B PACKAGING",
    "tons": 6.77,
    "totalPaise": 27375635
   },
   {
    "id": "sli-inv-56",
    "invNo": "SPL/073/26-27",
    "date": "2026-06-16",
    "firm": "llp",
    "party": "NEW AKTA AGENCY",
    "tons": 0.31,
    "totalPaise": 1553809
   },
   {
    "id": "sli-inv-55",
    "invNo": "SPL/072/26-27",
    "date": "2026-06-13",
    "firm": "llp",
    "party": "KPAC",
    "tons": 8.84,
    "totalPaise": 35647840
   },
   {
    "id": "sli-inv-54",
    "invNo": "SPL/071/26-27",
    "date": "2026-06-10",
    "firm": "llp",
    "party": "OASIS INTERIOR HUB",
    "tons": 17.41,
    "totalPaise": 100063593
   },
   {
    "id": "sli-inv-53",
    "invNo": "SPL/070/26-27",
    "date": "2026-06-09",
    "firm": "llp",
    "party": "SHAMBHU ENTERPRISE",
    "tons": 0.93,
    "totalPaise": 6997709
   },
   {
    "id": "sli-inv-52",
    "invNo": "SPL/066/26-27",
    "date": "2026-06-04",
    "firm": "llp",
    "party": "MEHER ENTERPRISE",
    "tons": 9.02,
    "totalPaise": 49201149
   }
  ]
 },
 "electricity": {
  "bills": 2,
  "billedUnits": 469800,
  "billedPaise": 778675000,
  "meteredUnits": 287700,
  "meteredPaise": 216809838,
  "byMonth": [
   {
    "month": "2026-08",
    "billedPaise": 382337500,
    "meteredUnits": 0,
    "meteredPaise": 0
   },
   {
    "month": "2026-09",
    "billedPaise": 396337500,
    "meteredUnits": 266400,
    "meteredPaise": 200835921
   },
   {
    "month": "2026-10",
    "billedPaise": 0,
    "meteredUnits": 21300,
    "meteredPaise": 15973917
   }
  ],
  "billList": [
   {
    "id": "elb-sep",
    "billDate": "2026-09-30",
    "dueDate": "2026-10-15",
    "paidDate": null,
    "units": 469800,
    "totalPaise": 396337500
   },
   {
    "id": "elb-aug",
    "billDate": "2026-08-31",
    "dueDate": "2026-09-15",
    "paidDate": "2026-09-10",
    "units": null,
    "totalPaise": 382337500
   }
  ],
  "readings": 28
 },
 "maintenance": {
  "workOrders": 5,
  "open": 4,
  "overdue": 2,
  "completed": 1,
  "byCategory": [
   {
    "name": "Civil",
    "value": 1
   },
   {
    "name": "Electrical",
    "value": 1
   },
   {
    "name": "Hydraulic",
    "value": 1
   },
   {
    "name": "Mechanical",
    "value": 1
   },
   {
    "name": "Pneumatic",
    "value": 1
   }
  ],
  "byPriority": [
   {
    "name": "Critical",
    "value": 2
   },
   {
    "name": "High",
    "value": 1
   },
   {
    "name": "Low",
    "value": 1
   },
   {
    "name": "Medium",
    "value": 1
   }
  ],
  "openList": [
   {
    "id": "wo-3",
    "woNo": "WO-26-0003",
    "title": "Panel PLC Fault \u2014 Line B",
    "category": "Electrical",
    "priority": "Critical",
    "assignee": "Suresh Yadav",
    "dueDate": "2026-09-27",
    "status": "Open",
    "overdue": true
   },
   {
    "id": "wo-1",
    "woNo": "WO-26-0001",
    "title": "Hydraulic Press #3 Oil Leak",
    "category": "Hydraulic",
    "priority": "Critical",
    "assignee": "Raj Kumar",
    "dueDate": "2026-09-28",
    "status": "In Progress",
    "overdue": true
   },
   {
    "id": "wo-2",
    "woNo": "WO-26-0002",
    "title": "Conveyor Belt Motor Bearing Noise",
    "category": "Mechanical",
    "priority": "High",
    "assignee": "Priya Nair",
    "dueDate": "2026-10-06",
    "status": "Open",
    "overdue": false
   },
   {
    "id": "wo-4",
    "woNo": "WO-26-0004",
    "title": "Air Compressor Pressure Drop",
    "category": "Pneumatic",
    "priority": "Medium",
    "assignee": "Meena Das",
    "dueDate": "2026-10-09",
    "status": "On Hold",
    "overdue": false
   }
  ]
 },
 "overview": {
  "from": "2026-04-01",
  "to": "2026-10-05",
  "purchasePaise": 800473671,
  "purchaseEntries": 70,
  "boards": 0,
  "hpReports": 0,
  "powerPaise": 216809838,
  "powerUnits": 287700,
  "revenuePaise": 1430172777,
  "invoices": 57,
  "costPerBoardPaise": null,
  "openWorkOrders": 4,
  "months": [
   {
    "month": "2026-04",
    "purchasePaise": 419599196,
    "boards": 0,
    "powerPaise": 0,
    "revenuePaise": 863723002
   },
   {
    "month": "2026-05",
    "purchasePaise": 380874475,
    "boards": 0,
    "powerPaise": 0,
    "revenuePaise": 293906729
   },
   {
    "month": "2026-06",
    "purchasePaise": 0,
    "boards": 0,
    "powerPaise": 0,
    "revenuePaise": 272543046
   },
   {
    "month": "2026-08",
    "purchasePaise": 0,
    "boards": 0,
    "powerPaise": 0,
    "revenuePaise": 0
   },
   {
    "month": "2026-09",
    "purchasePaise": 0,
    "boards": 0,
    "powerPaise": 200835921,
    "revenuePaise": 0
   },
   {
    "month": "2026-10",
    "purchasePaise": 0,
    "boards": 0,
    "powerPaise": 15973917,
    "revenuePaise": 0
   }
  ],
  "materialShare": [
   {
    "name": "Nilgiri Wood",
    "value": 352719024
   },
   {
    "name": "Resin",
    "value": 318175200
   },
   {
    "name": "Core Veneer",
    "value": 84889947
   },
   {
    "name": "Kraft Paper",
    "value": 44689500
   }
  ]
 },
 "years": [
  "2026-27"
 ],
 "production": {
  "reports": 3,
  "boards": 1260,
  "byMonth": [
   {
    "month": "2026-09",
    "value": 1260
   }
  ],
  "byProduct": [
   {
    "product": "18 mm OSB",
    "reports": 2,
    "boards": 840
   },
   {
    "product": "12 mm OSB",
    "reports": 1,
    "boards": 420
   }
  ],
  "byShift": [
   {
    "name": "Day",
    "value": 840
   },
   {
    "name": "Night",
    "value": 420
   }
  ]
 }
};
