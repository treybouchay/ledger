/** Seeded from Google Sheet: gear profit estimates + cash ledger. */
import type { GearCashMove, GearMonth } from '../types'

export const GEAR_MONTHS_SEED: GearMonth[] = [
  {
    "id": "2026-01",
    "label": "Jan",
    "inventory": [
      {
        "id": "inv-1",
        "boughtDate": "2026-01-03",
        "item": "CCM eflex 6.9",
        "targetSold": 500.0,
        "bought": 350.0,
        "projectedProfit": 150.0
      },
      {
        "id": "inv-3",
        "boughtDate": null,
        "item": "True Glove 7x4",
        "targetSold": 200.0,
        "bought": 70.0,
        "projectedProfit": 130.0
      },
      {
        "id": "inv-4",
        "boughtDate": null,
        "item": "True Blocker L87 XL",
        "targetSold": 150.0,
        "bought": 70.0,
        "projectedProfit": 80.0
      },
      {
        "id": "inv-5",
        "boughtDate": "2026-01-08",
        "item": "Right handed Hyperlight 2 glove",
        "targetSold": 275.0,
        "bought": 120.0,
        "projectedProfit": 155.0
      },
      {
        "id": "inv-7",
        "boughtDate": null,
        "item": "Step Steel Black XS",
        "targetSold": 100.0,
        "bought": 40.0,
        "projectedProfit": null
      },
      {
        "id": "inv-8",
        "boughtDate": "2026-01-25",
        "item": "M5 Pro L Int White",
        "targetSold": 375.0,
        "bought": 190.0,
        "projectedProfit": 185.0
      },
      {
        "id": "inv-10",
        "boughtDate": "2026-01-25",
        "item": "ultrasonic",
        "targetSold": 550.0,
        "bought": 350.0,
        "projectedProfit": 200.0
      },
      {
        "id": "inv-12",
        "boughtDate": "2026-01-27",
        "item": "Hyper lite 2 catcher",
        "targetSold": 225.0,
        "bought": 75.0,
        "projectedProfit": 150.0
      },
      {
        "id": "inv-14",
        "boughtDate": null,
        "item": "Ultra sonic Blocker",
        "targetSold": 150.0,
        "bought": 75.0,
        "projectedProfit": 75.0
      },
      {
        "id": "inv-15",
        "boughtDate": null,
        "item": "Brian's Maroon Gnetik 5 Blocker and Catcher",
        "targetSold": 300.0,
        "bought": 150.0,
        "projectedProfit": 150.0
      },
      {
        "id": "inv-16",
        "boughtDate": "2026-01-27",
        "item": "Hyperlite Pads White",
        "targetSold": 600.0,
        "bought": 300.0,
        "projectedProfit": 300.0
      },
      {
        "id": "inv-18",
        "boughtDate": null,
        "item": "Bauer 3x glove",
        "targetSold": 150.0,
        "bought": 25.0,
        "projectedProfit": 125.0
      }
    ],
    "oldInventory": [
      {
        "id": "old-19",
        "boughtDate": null,
        "item": "G6 Blocker",
        "targetSold": 100.0,
        "bought": 35.0,
        "projectedProfit": 65.0
      },
      {
        "id": "old-20",
        "boughtDate": null,
        "item": "G6 Glove",
        "targetSold": 100.0,
        "bought": 35.0,
        "projectedProfit": 65.0
      },
      {
        "id": "old-21",
        "boughtDate": "2026-01-10",
        "item": "Warrior G6 pads Int 32+1",
        "targetSold": 325.0,
        "bought": 300.0,
        "projectedProfit": 25.0
      },
      {
        "id": "old-23",
        "boughtDate": null,
        "item": "Int RG warrior chestie",
        "targetSold": 115.0,
        "bought": 100.0,
        "projectedProfit": 15.0
      },
      {
        "id": "old-24",
        "boughtDate": "2026-01-12",
        "item": "CCM 5.5 pads",
        "targetSold": 150.0,
        "bought": 150.0,
        "projectedProfit": 0.0
      },
      {
        "id": "old-26",
        "boughtDate": null,
        "item": "Chestie Bauer",
        "targetSold": 100.0,
        "bought": 0.0,
        "projectedProfit": 100.0
      },
      {
        "id": "old-27",
        "boughtDate": null,
        "item": "Red RBK pads package",
        "targetSold": 150.0,
        "bought": 100.0,
        "projectedProfit": 50.0
      },
      {
        "id": "old-28",
        "boughtDate": null,
        "item": "Bauer Glove s29",
        "targetSold": 50.0,
        "bought": 25.0,
        "projectedProfit": 25.0
      },
      {
        "id": "old-29",
        "boughtDate": null,
        "item": "Bauer Blocker s29",
        "targetSold": 50.0,
        "bought": 25.0,
        "projectedProfit": 25.0
      }
    ],
    "sales": [
      {
        "id": "sale-2",
        "soldDate": "2026-01-03",
        "item": "CCM eflex 6.9",
        "soldPrice": 500.0,
        "boughtPrice": 350.0,
        "profit": 150.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-6",
        "soldDate": "2026-01-08",
        "item": "Right handed Hyperlight 2 glove",
        "soldPrice": 275.0,
        "boughtPrice": 120.0,
        "profit": 155.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-9",
        "soldDate": "2026-01-25",
        "item": "M5 Pro L Int White",
        "soldPrice": 375.0,
        "boughtPrice": 190.0,
        "profit": 185.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-11",
        "soldDate": "2026-01-25",
        "item": "ultrasonic",
        "soldPrice": 700.0,
        "boughtPrice": 350.0,
        "profit": 350.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-13",
        "soldDate": "2026-01-27",
        "item": "Hyper lite 2 catcher",
        "soldPrice": 225.0,
        "boughtPrice": 75.0,
        "profit": 150.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-17",
        "soldDate": "2026-01-27",
        "item": "Hyperlite Pads White",
        "soldPrice": 500.0,
        "boughtPrice": 300.0,
        "profit": 200.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-22",
        "soldDate": null,
        "item": "Warrior G6 pads Int 32+1",
        "soldPrice": 325.0,
        "boughtPrice": 300.0,
        "profit": 25.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "old"
      },
      {
        "id": "sale-25",
        "soldDate": null,
        "item": "CCM 5.5 pads",
        "soldPrice": 150.0,
        "boughtPrice": 150.0,
        "profit": 0.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "old"
      },
      {
        "id": "sale-30",
        "soldDate": null,
        "item": null,
        "soldPrice": 475.0,
        "boughtPrice": 450.0,
        "profit": 25.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "old"
      }
    ]
  },
  {
    "id": "2026-02",
    "label": "Feb",
    "inventory": [
      {
        "id": "inv-31",
        "boughtDate": null,
        "item": "True Glove 7x4",
        "targetSold": 200.0,
        "bought": 70.0,
        "projectedProfit": 130.0
      },
      {
        "id": "inv-32",
        "boughtDate": null,
        "item": "True Blocker L87 XL",
        "targetSold": 150.0,
        "bought": 70.0,
        "projectedProfit": 80.0
      },
      {
        "id": "inv-33",
        "boughtDate": null,
        "item": "Ultra sonic Blocker",
        "targetSold": 150.0,
        "bought": 75.0,
        "projectedProfit": 75.0
      },
      {
        "id": "inv-34",
        "boughtDate": null,
        "item": "Brian's Maroon Gnetik 5 Blocker and Catcher",
        "targetSold": 300.0,
        "bought": 150.0,
        "projectedProfit": 150.0
      },
      {
        "id": "inv-36",
        "boughtDate": null,
        "item": "Bauer 3s glove",
        "targetSold": 150.0,
        "bought": 25.0,
        "projectedProfit": 125.0
      },
      {
        "id": "inv-38",
        "boughtDate": null,
        "item": "Hyperlite 1 White L",
        "targetSold": 500.0,
        "bought": 300.0,
        "projectedProfit": 200.0
      },
      {
        "id": "inv-40",
        "boughtDate": null,
        "item": "CCM eflex 5.9 black and white 34+2",
        "targetSold": 400.0,
        "bought": 245.0,
        "projectedProfit": 155.0
      },
      {
        "id": "inv-42",
        "boughtDate": null,
        "item": "Bauer Konekt",
        "targetSold": 350.0,
        "bought": 175.0,
        "projectedProfit": 175.0
      },
      {
        "id": "inv-44",
        "boughtDate": null,
        "item": "CCM like new eflex 5.5 catcher + blocker",
        "targetSold": 400.0,
        "bought": 275.0,
        "projectedProfit": 125.0
      },
      {
        "id": "inv-46",
        "boughtDate": null,
        "item": "Hyperlite 2 glove Pro stock",
        "targetSold": 275.0,
        "bought": 160.0,
        "projectedProfit": 115.0
      },
      {
        "id": "inv-48",
        "boughtDate": null,
        "item": "HL 2 White 34+1",
        "targetSold": 700.0,
        "bought": 500.0,
        "projectedProfit": 200.0
      },
      {
        "id": "inv-49",
        "boughtDate": null,
        "item": "CCM 6.9 33+1 white",
        "targetSold": 400.0,
        "bought": 250.0,
        "projectedProfit": 150.0
      },
      {
        "id": "inv-51",
        "boughtDate": null,
        "item": "HL 2 Glove",
        "targetSold": 150.0,
        "bought": 100.0,
        "projectedProfit": 50.0
      },
      {
        "id": "inv-53",
        "boughtDate": null,
        "item": "HL1 Black glove and Blocker",
        "targetSold": 350.0,
        "bought": 200.0,
        "projectedProfit": 150.0
      }
    ],
    "oldInventory": [
      {
        "id": "old-55",
        "boughtDate": null,
        "item": "G6 Blocker",
        "targetSold": 100.0,
        "bought": 35.0,
        "projectedProfit": 65.0
      },
      {
        "id": "old-57",
        "boughtDate": null,
        "item": "G6 Glove",
        "targetSold": 100.0,
        "bought": 35.0,
        "projectedProfit": 65.0
      },
      {
        "id": "old-58",
        "boughtDate": null,
        "item": "Int RG warrior chestie",
        "targetSold": 115.0,
        "bought": 100.0,
        "projectedProfit": 15.0
      },
      {
        "id": "old-59",
        "boughtDate": null,
        "item": "Bauer Glove s29",
        "targetSold": 50.0,
        "bought": 25.0,
        "projectedProfit": 25.0
      },
      {
        "id": "old-60",
        "boughtDate": null,
        "item": "Bauer Blocker s29",
        "targetSold": 50.0,
        "bought": 25.0,
        "projectedProfit": 25.0
      }
    ],
    "sales": [
      {
        "id": "sale-35",
        "soldDate": null,
        "item": "Brian's Maroon Gnetik 5 Blocker and Catcher",
        "soldPrice": 300.0,
        "boughtPrice": 150.0,
        "profit": 150.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-37",
        "soldDate": null,
        "item": "Bauer 3s glove",
        "soldPrice": 100.0,
        "boughtPrice": 25.0,
        "profit": 75.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-39",
        "soldDate": null,
        "item": "Hyperlite 1 White L",
        "soldPrice": 500.0,
        "boughtPrice": 300.0,
        "profit": 200.0,
        "actualSold": 500.0,
        "actualProfit": 200.0,
        "bucket": "new"
      },
      {
        "id": "sale-41",
        "soldDate": null,
        "item": "CCM eflex 5.9 black and white 34+2",
        "soldPrice": 400.0,
        "boughtPrice": 245.0,
        "profit": 155.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-43",
        "soldDate": null,
        "item": "Bauer Konekt",
        "soldPrice": 300.0,
        "boughtPrice": 175.0,
        "profit": 125.0,
        "actualSold": 300.0,
        "actualProfit": 125.0,
        "bucket": "new"
      },
      {
        "id": "sale-45",
        "soldDate": null,
        "item": "CCM like new eflex 5.5 catcher + blocker",
        "soldPrice": 400.0,
        "boughtPrice": 275.0,
        "profit": 125.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-47",
        "soldDate": null,
        "item": "Hyperlite 2 glove Pro stock",
        "soldPrice": 300.0,
        "boughtPrice": 160.0,
        "profit": 140.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-50",
        "soldDate": null,
        "item": "CCM 6.9 33+1 white",
        "soldPrice": 400.0,
        "boughtPrice": 250.0,
        "profit": 150.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-52",
        "soldDate": null,
        "item": "HL 2 Glove",
        "soldPrice": 200.0,
        "boughtPrice": 100.0,
        "profit": 100.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-54",
        "soldDate": null,
        "item": "HL1 Black glove and Blocker",
        "soldPrice": 300.0,
        "boughtPrice": 200.0,
        "profit": 100.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-56",
        "soldDate": null,
        "item": "G6 Blocker",
        "soldPrice": 100.0,
        "boughtPrice": 0.0,
        "profit": 100.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "old"
      },
      {
        "id": "sale-61",
        "soldDate": null,
        "item": null,
        "soldPrice": 100.0,
        "boughtPrice": 0.0,
        "profit": 100.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "old"
      }
    ]
  },
  {
    "id": "2026-03",
    "label": "March",
    "inventory": [
      {
        "id": "inv-62",
        "boughtDate": null,
        "item": "True Glove 7x4",
        "targetSold": 200.0,
        "bought": 70.0,
        "projectedProfit": 130.0
      },
      {
        "id": "inv-63",
        "boughtDate": null,
        "item": "True Blocker L87 XL",
        "targetSold": 150.0,
        "bought": 70.0,
        "projectedProfit": 80.0
      },
      {
        "id": "inv-64",
        "boughtDate": null,
        "item": "Ultra sonic Blocker",
        "targetSold": 150.0,
        "bought": 75.0,
        "projectedProfit": 75.0
      },
      {
        "id": "inv-65",
        "boughtDate": null,
        "item": "Brian's Maroon Gnetik 5 Blocker and Catcher",
        "targetSold": 300.0,
        "bought": 150.0,
        "projectedProfit": 150.0
      },
      {
        "id": "inv-67",
        "boughtDate": null,
        "item": "Bauer 3s glove",
        "targetSold": 150.0,
        "bought": 25.0,
        "projectedProfit": 125.0
      },
      {
        "id": "inv-68",
        "boughtDate": null,
        "item": "CCM eflex 5.9 black and white 34+2",
        "targetSold": 400.0,
        "bought": 245.0,
        "projectedProfit": 155.0
      },
      {
        "id": "inv-70",
        "boughtDate": null,
        "item": "CCM like new eflex 5.5 catcher + blocker",
        "targetSold": 400.0,
        "bought": 275.0,
        "projectedProfit": 125.0
      },
      {
        "id": "inv-72",
        "boughtDate": null,
        "item": "Hyperlite 2 glove Pro stock",
        "targetSold": 275.0,
        "bought": 160.0,
        "projectedProfit": 115.0
      },
      {
        "id": "inv-74",
        "boughtDate": null,
        "item": "HL 2 White 34+1",
        "targetSold": 700.0,
        "bought": 500.0,
        "projectedProfit": 200.0
      },
      {
        "id": "inv-75",
        "boughtDate": null,
        "item": "CCM 6.9 33+1 white",
        "targetSold": 400.0,
        "bought": 250.0,
        "projectedProfit": 150.0
      },
      {
        "id": "inv-77",
        "boughtDate": null,
        "item": "HL 2 Glove",
        "targetSold": 150.0,
        "bought": 100.0,
        "projectedProfit": 50.0
      },
      {
        "id": "inv-79",
        "boughtDate": null,
        "item": "HL1 Black glove and Blocker",
        "targetSold": 350.0,
        "bought": 200.0,
        "projectedProfit": 150.0
      }
    ],
    "oldInventory": [
      {
        "id": "old-81",
        "boughtDate": null,
        "item": "G6 Blocker",
        "targetSold": 100.0,
        "bought": 35.0,
        "projectedProfit": 65.0
      },
      {
        "id": "old-82",
        "boughtDate": null,
        "item": "G6 Glove",
        "targetSold": 100.0,
        "bought": 35.0,
        "projectedProfit": 65.0
      },
      {
        "id": "old-83",
        "boughtDate": null,
        "item": "Int RG warrior chestie",
        "targetSold": 115.0,
        "bought": 100.0,
        "projectedProfit": 15.0
      },
      {
        "id": "old-84",
        "boughtDate": null,
        "item": "Bauer Glove s29",
        "targetSold": 50.0,
        "bought": 25.0,
        "projectedProfit": 25.0
      },
      {
        "id": "old-85",
        "boughtDate": null,
        "item": "Bauer Blocker s29",
        "targetSold": 50.0,
        "bought": 25.0,
        "projectedProfit": 25.0
      }
    ],
    "sales": [
      {
        "id": "sale-66",
        "soldDate": null,
        "item": "Brian's Maroon Gnetik 5 Blocker and Catcher",
        "soldPrice": 400.0,
        "boughtPrice": 150.0,
        "profit": 250.0,
        "actualSold": 400.0,
        "actualProfit": 250.0,
        "bucket": "new"
      },
      {
        "id": "sale-69",
        "soldDate": null,
        "item": "CCM eflex 5.9 black and white 34+2",
        "soldPrice": 415.0,
        "boughtPrice": 245.0,
        "profit": 170.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-71",
        "soldDate": null,
        "item": "CCM like new eflex 5.5 catcher + blocker",
        "soldPrice": 400.0,
        "boughtPrice": 275.0,
        "profit": 125.0,
        "actualSold": 400.0,
        "actualProfit": 125.0,
        "bucket": "new"
      },
      {
        "id": "sale-73",
        "soldDate": null,
        "item": "Hyperlite 2 glove Pro stock",
        "soldPrice": 265.0,
        "boughtPrice": 160.0,
        "profit": 105.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-76",
        "soldDate": null,
        "item": "CCM 6.9 33+1 white",
        "soldPrice": 400.0,
        "boughtPrice": 250.0,
        "profit": null,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-78",
        "soldDate": null,
        "item": "HL 2 Glove",
        "soldPrice": 200.0,
        "boughtPrice": 100.0,
        "profit": 100.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-80",
        "soldDate": null,
        "item": "HL1 Black glove and Blocker",
        "soldPrice": 300.0,
        "boughtPrice": 200.0,
        "profit": 100.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-86",
        "soldDate": null,
        "item": null,
        "soldPrice": 0.0,
        "boughtPrice": 0.0,
        "profit": 0.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "old"
      }
    ]
  },
  {
    "id": "2026-05",
    "label": "May",
    "inventory": [
      {
        "id": "inv-87",
        "boughtDate": null,
        "item": "Bauer 3s glove",
        "targetSold": 150.0,
        "bought": 25.0,
        "projectedProfit": 125.0
      },
      {
        "id": "inv-88",
        "boughtDate": null,
        "item": "Hyperlite 2 glove Pro stock",
        "targetSold": 275.0,
        "bought": 160.0,
        "projectedProfit": 115.0
      },
      {
        "id": "inv-90",
        "boughtDate": null,
        "item": "HL 2 Glove",
        "targetSold": 150.0,
        "bought": 100.0,
        "projectedProfit": 50.0
      },
      {
        "id": "inv-91",
        "boughtDate": null,
        "item": "True Skates 8.5",
        "targetSold": 350.0,
        "bought": 300.0,
        "projectedProfit": 50.0
      }
    ],
    "oldInventory": [
      {
        "id": "old-93",
        "boughtDate": null,
        "item": "G6 Blocker",
        "targetSold": 100.0,
        "bought": 35.0,
        "projectedProfit": 65.0
      },
      {
        "id": "old-94",
        "boughtDate": null,
        "item": "G6 Glove",
        "targetSold": 100.0,
        "bought": 35.0,
        "projectedProfit": 65.0
      },
      {
        "id": "old-95",
        "boughtDate": null,
        "item": "Int RG warrior chestie",
        "targetSold": 115.0,
        "bought": 100.0,
        "projectedProfit": 15.0
      },
      {
        "id": "old-96",
        "boughtDate": null,
        "item": "Bauer Glove s29",
        "targetSold": 50.0,
        "bought": 25.0,
        "projectedProfit": 25.0
      },
      {
        "id": "old-97",
        "boughtDate": null,
        "item": "Bauer Blocker s29",
        "targetSold": 50.0,
        "bought": 25.0,
        "projectedProfit": 25.0
      }
    ],
    "sales": [
      {
        "id": "sale-89",
        "soldDate": null,
        "item": "Hyperlite 2 glove Pro stock",
        "soldPrice": 165.0,
        "boughtPrice": 0.0,
        "profit": 165.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-92",
        "soldDate": null,
        "item": "True Skates 8.5",
        "soldPrice": 350.0,
        "boughtPrice": 300.0,
        "profit": 50.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "new"
      },
      {
        "id": "sale-98",
        "soldDate": null,
        "item": null,
        "soldPrice": 0.0,
        "boughtPrice": 0.0,
        "profit": 0.0,
        "actualSold": null,
        "actualProfit": null,
        "bucket": "old"
      }
    ]
  },
  {
    "id": "2026-08",
    "label": "Aug",
    "inventory": [],
    "oldInventory": [],
    "sales": []
  }
] as GearMonth[]

/** Clean checkbook moves only (no sheet subtotal rows). Opening balance defaults to 0. */
export const GEAR_OPENING_BALANCE = 0

export const GEAR_CASH_SEED: GearCashMove[] = [
  {
    "id": "cash-1",
    "date": "2025-12-24",
    "type": "BUY",
    "item": "CCM eflex 6.9 Pads 34+1",
    "amount": 350.0,
    "direction": "out"
  },
  {
    "id": "cash-2",
    "date": "2026-01-03",
    "type": "SELL",
    "item": "CCM eflex 6.9 Pads 34+1",
    "amount": 500.0,
    "direction": "in"
  },
  {
    "id": "cash-3",
    "date": "2026-01-03",
    "type": "BUY",
    "item": "Hyperlite 2 glove FULL RIGHT",
    "amount": 120.0,
    "direction": "out"
  },
  {
    "id": "cash-4",
    "date": null,
    "type": "BUY",
    "item": "STEP Black steel XS",
    "amount": 40.0,
    "direction": "out"
  },
  {
    "id": "cash-5",
    "date": "2026-01-08",
    "type": "SELL",
    "item": "Hyperlite 2 glove FULL RIGHT",
    "amount": 275.0,
    "direction": "in"
  },
  {
    "id": "cash-6",
    "date": "2026-01-10",
    "type": "SELL",
    "item": "Warrior 32+ G6 White Pads",
    "amount": 325.0,
    "direction": "in"
  },
  {
    "id": "cash-7",
    "date": "2026-01-10",
    "type": "BUY",
    "item": "M5 Pro L Int pads",
    "amount": 190.0,
    "direction": "out"
  },
  {
    "id": "cash-8",
    "date": "2026-01-11",
    "type": "BUY",
    "item": "ultrasonic Pads Sr M",
    "amount": 350.0,
    "direction": "out"
  },
  {
    "id": "cash-9",
    "date": "2026-01-12",
    "type": "SELL",
    "item": "CCM 5.5 Blue 33+1 pads",
    "amount": 150.0,
    "direction": "in"
  },
  {
    "id": "cash-10",
    "date": "2026-01-19",
    "type": "BUY",
    "item": "Hyper lite 2 catcher + Super sonic Blocker",
    "amount": 150.0,
    "direction": "out"
  },
  {
    "id": "cash-11",
    "date": null,
    "type": "BUY",
    "item": "Brian's Maroon Gnetik 5 Blocker and Catcher",
    "amount": 150.0,
    "direction": "out"
  },
  {
    "id": "cash-12",
    "date": "2026-01-19",
    "type": "BUY",
    "item": "Hyperlite pads White + 3x glove",
    "amount": 325.0,
    "direction": "out"
  },
  {
    "id": "cash-13",
    "date": "2026-01-25",
    "type": "SELL",
    "item": "M5 Pro L Int pads",
    "amount": 375.0,
    "direction": "in"
  },
  {
    "id": "cash-14",
    "date": "2026-01-25",
    "type": "SELL",
    "item": "ultrasonic pads sr m",
    "amount": 700.0,
    "direction": "in"
  },
  {
    "id": "cash-15",
    "date": "2026-01-27",
    "type": "SELL",
    "item": "hyperlite 1 senior white pads L",
    "amount": 500.0,
    "direction": "in"
  },
  {
    "id": "cash-16",
    "date": null,
    "type": "SELL",
    "item": "hyperlite 2 glove",
    "amount": 225.0,
    "direction": "in"
  },
  {
    "id": "cash-17",
    "date": "2026-01-28",
    "type": "BUY",
    "item": "Hyperlite 2 Navy M",
    "amount": 300.0,
    "direction": "out"
  },
  {
    "id": "cash-18",
    "date": null,
    "type": "BUY",
    "item": "Hyperlite 1 White L",
    "amount": 300.0,
    "direction": "out"
  },
  {
    "id": "cash-19",
    "date": null,
    "type": "BUY",
    "item": "CCM eflex 5.9 black and white 34+2",
    "amount": 245.0,
    "direction": "out"
  },
  {
    "id": "cash-20",
    "date": "2026-02-04",
    "type": "BUY",
    "item": "Bauer Konekt",
    "amount": 175.0,
    "direction": "out"
  },
  {
    "id": "cash-21",
    "date": "2026-02-12",
    "type": "BUY",
    "item": "CCM like new eflex 5 catcher + blocker",
    "amount": 275.0,
    "direction": "out"
  },
  {
    "id": "cash-22",
    "date": "2026-02-12",
    "type": "BUY",
    "item": "Bauer hyperlite 2 catcher pro return",
    "amount": 160.0,
    "direction": "out"
  },
  {
    "id": "cash-23",
    "date": "2026-02-17",
    "type": "BUY",
    "item": "HL2 White pads 34+1",
    "amount": 500.0,
    "direction": "out"
  },
  {
    "id": "cash-24",
    "date": null,
    "type": "SELL",
    "item": "Bauer Konekt",
    "amount": 300.0,
    "direction": "in"
  },
  {
    "id": "cash-25",
    "date": null,
    "type": "SELL",
    "item": "Blocker",
    "amount": 100.0,
    "direction": "in"
  },
  {
    "id": "cash-26",
    "date": null,
    "type": "BUY",
    "item": "CCM 33+1 6.9 + HL 2 Glove",
    "amount": 350.0,
    "direction": "out"
  },
  {
    "id": "cash-27",
    "date": "2026-01-28",
    "type": "SELL",
    "item": "Hyperlite 1 bluie and wihte L",
    "amount": 500.0,
    "direction": "in"
  },
  {
    "id": "cash-28",
    "date": null,
    "type": "BUY",
    "item": "HL 2 black glove set",
    "amount": 200.0,
    "direction": "out"
  },
  {
    "id": "cash-29",
    "date": null,
    "type": "SELL",
    "item": "Brian's Glove set",
    "amount": 400.0,
    "direction": "in"
  },
  {
    "id": "cash-30",
    "date": null,
    "type": "SELL",
    "item": "CCM like new eflex 5.5 catcher + blocker",
    "amount": 400.0,
    "direction": "in"
  },
  {
    "id": "cash-31",
    "date": null,
    "type": "SELL",
    "item": "eflex 34",
    "amount": 400.0,
    "direction": "in"
  },
  {
    "id": "cash-32",
    "date": "2026-03-24",
    "type": "SELL",
    "item": "eflex 33",
    "amount": 375.0,
    "direction": "in"
  },
  {
    "id": "cash-33",
    "date": null,
    "type": "BUY",
    "item": "mach pads 33",
    "amount": 380.0,
    "direction": "out"
  },
  {
    "id": "cash-34",
    "date": null,
    "type": "SELL",
    "item": "mach pads 33",
    "amount": 450.0,
    "direction": "in"
  }
] as GearCashMove[]
