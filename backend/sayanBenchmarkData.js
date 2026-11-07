// Ground-truth benchmark dataset extracted directly from Sayan ERP database
// Reflects authentic item codes, accurate names, genuine weights (kg) and carton counts.

export function generateBenchmarkData() {
    const lastYearStock = [
    {
        "itemCode": "010202021001",
        "itemName": "POY 250/48 مشکی",
        "groupName": "POY",
        "subGroupName": "POY 250/48 مشکی",
        "inflowQty": 418585.42,
        "outflowQty": 418585.42,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010214100110011001",
        "itemName": "POY 75/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 75/48 سفید",
        "inflowQty": 3423.32,
        "outflowQty": 1711.66,
        "stockQty": 1711.66,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301021001",
        "itemName": "پلی استر 100 مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 مشکی",
        "inflowQty": 218710.673,
        "outflowQty": 217008.473,
        "stockQty": 1702.2,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103010401",
        "itemName": "پلی استر 100 قرمز",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 قرمز",
        "inflowQty": 102.903,
        "outflowQty": 102.903,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302061001",
        "itemName": "پلی استر 150 آبی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 آبی",
        "inflowQty": 1900.24,
        "outflowQty": 1900.24,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021101",
        "itemName": "dty یا پلی استر - کد 021101",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 1074.72,
        "outflowQty": 1074.72,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302201001",
        "itemName": "dty یا پلی استر - کد 02201001",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 701.935,
        "outflowQty": 701.935,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100105",
        "itemName": "dty یا پلی استر - کد 0221100105",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 43.3,
        "outflowQty": 43.3,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100108",
        "itemName": "dty یا پلی استر - کد 0221100108",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 352.918,
        "outflowQty": 352.915,
        "stockQty": 0.003,
        "cartonsQty": 0
    },
    {
        "itemCode": "010303041001",
        "itemName": "پلی استر 300/48 طوسی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/48 طوسی",
        "inflowQty": 1485.24,
        "outflowQty": 1485.24,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103041001",
        "itemName": "پلی استر 75 سفید نانو",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 75 سفید نانو",
        "inflowQty": 51.397,
        "outflowQty": 0,
        "stockQty": 51.397,
        "cartonsQty": 0
    },
    {
        "itemCode": "010309021001",
        "itemName": "پلی استر 300 مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 مینگل سفید",
        "inflowQty": 4442.47,
        "outflowQty": 3317.13,
        "stockQty": 1125.34,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051001",
        "itemName": "لاکرا - کد 1001",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 16874.04,
        "outflowQty": 16761.937,
        "stockQty": 112.103,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051002",
        "itemName": "لاکرا - کد 1002",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 7062.648,
        "outflowQty": 6072.648,
        "stockQty": 990,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010103031004",
        "itemName": "اسپندکس (کاور 40/150) قرمز FSE",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/150) قرمز FSE",
        "inflowQty": 8783.72,
        "outflowQty": 8783.72,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010202011001",
        "itemName": "اسپندکس (کاور 30/100) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/100) سفید",
        "inflowQty": 24083.2,
        "outflowQty": 18135.025,
        "stockQty": 5948.175,
        "cartonsQty": 397
    },
    {
        "itemCode": "04020101081003",
        "itemName": "کش 110S سفید مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 110S سفید مخروطی",
        "inflowQty": 16.88,
        "outflowQty": 16.88,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040201020602",
        "itemName": "کش 110 مشکی مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 110 مشکی مخروطی",
        "inflowQty": 5312.19,
        "outflowQty": 5272.25,
        "stockQty": 39.94,
        "cartonsQty": 2
    },
    {
        "itemCode": "04020210111001",
        "itemName": "کش 90 مشکی بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 90 مشکی بشقابی",
        "inflowQty": 57,
        "outflowQty": 38,
        "stockQty": 19,
        "cartonsQty": 1
    },
    {
        "itemCode": "040202101110031003",
        "itemName": "کش 90F مشکی مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 90F مشکی مخروطی",
        "inflowQty": 17775.22,
        "outflowQty": 15546.67,
        "stockQty": 2228.55,
        "cartonsQty": 139
    },
    {
        "itemCode": "0402041001",
        "itemName": "کش 40 سفید",
        "groupName": "کش",
        "subGroupName": "کش 40 سفید",
        "inflowQty": 490.68,
        "outflowQty": 472.72,
        "stockQty": 17.96,
        "cartonsQty": 1
    },
    {
        "itemCode": "0403010301002",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 010301002",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 1003.88,
        "outflowQty": 1003.88,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040301041001",
        "itemName": "ساپورت 40/300 سفید",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "ساپورت 40/300 سفید",
        "inflowQty": 10.21,
        "outflowQty": 10.21,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04030302021001",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 0302021001",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 6200.21,
        "outflowQty": 2504.6,
        "stockQty": 3695.61,
        "cartonsQty": 217
    },
    {
        "itemCode": "040501011001",
        "itemName": "پلی استر شوایتر 150 سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 سفید",
        "inflowQty": 91973.12,
        "outflowQty": 83997.49,
        "stockQty": 7975.63,
        "cartonsQty": 515
    },
    {
        "itemCode": "0405010801",
        "itemName": "پلی استر شوایتر 150 کرم",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 کرم",
        "inflowQty": 4733.64,
        "outflowQty": 4293.06,
        "stockQty": 440.58,
        "cartonsQty": 28
    },
    {
        "itemCode": "010202011002",
        "itemName": "POY 250/96 سفید",
        "groupName": "POY",
        "subGroupName": "POY 250/96 سفید",
        "inflowQty": 9031.24,
        "outflowQty": 9031.24,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0102020601",
        "itemName": "POY - کد 020601",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 120944.99,
        "outflowQty": 120944.99,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202091001",
        "itemName": "POY - کد 02091001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 3846,
        "outflowQty": 3846,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202140101",
        "itemName": "POY - کد 02140101",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 27316,
        "outflowQty": 27316,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202160101",
        "itemName": "POY - کد 02160101",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 6251.45,
        "outflowQty": 6251.45,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01020304021001",
        "itemName": "POY - کد 0304021001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 1579,
        "outflowQty": 1579,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301021002",
        "itemName": "پلی استر 100 ذغالی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 ذغالی",
        "inflowQty": 14517.3,
        "outflowQty": 14517.3,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103010901",
        "itemName": "dty یا پلی استر - کد 010901",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 1270.96,
        "outflowQty": 1270.96,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302061002",
        "itemName": "پلی استر 150 آبی شالی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 آبی شالی",
        "inflowQty": 5713.86,
        "outflowQty": 5713.86,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302081001",
        "itemName": "پلی استر 150 سبز",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 سبز",
        "inflowQty": 4778.64,
        "outflowQty": 3904.42,
        "stockQty": 874.22,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021001",
        "itemName": "پلی استر 150/48 طوسی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/48 طوسی",
        "inflowQty": 13171.877,
        "outflowQty": 13171.877,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302141001",
        "itemName": "پلی استر 150 قهوه ای",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 قهوه ای",
        "inflowQty": 9302.866,
        "outflowQty": 8075.786,
        "stockQty": 1227.08,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103030601",
        "itemName": "پلی استر 300/96 کرم خاکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/96 کرم خاکی",
        "inflowQty": 3258.36,
        "outflowQty": 1690.08,
        "stockQty": 1568.28,
        "cartonsQty": 0
    },
    {
        "itemCode": "010308021001",
        "itemName": "پلی استر 600 کو مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 600 کو مینگل سفید",
        "inflowQty": 63076.02,
        "outflowQty": 53991.4,
        "stockQty": 9084.62,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103110101",
        "itemName": "پلی استر 200 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 سفید",
        "inflowQty": 2957.06,
        "outflowQty": 1804.68,
        "stockQty": 1152.38,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100110021001",
        "itemName": "پلی استر 300/48 کو مینگل خاکستری پفکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/48 کو مینگل خاکستری پفکی",
        "inflowQty": 84383.06,
        "outflowQty": 83912.26,
        "stockQty": 470.8,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104011002",
        "itemName": "لاستیک - کد 011002",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 48705.744,
        "outflowQty": 32125.744,
        "stockQty": 16580,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104021002",
        "itemName": "لاستیک - کد 021002",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 400,
        "outflowQty": 0,
        "stockQty": 400,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104041001",
        "itemName": "لاستیک - کد 041001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 4220,
        "outflowQty": 0,
        "stockQty": 4220,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101020401",
        "itemName": "اسپندکس (کاور 40/100 ) نارنجی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100 ) نارنجی",
        "inflowQty": 744.66,
        "outflowQty": 555.06,
        "stockQty": 189.6,
        "cartonsQty": 13
    },
    {
        "itemCode": "040101020601",
        "itemName": "اسپندکس (کاور 40/100) طوسی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) طوسی",
        "inflowQty": 1243.76,
        "outflowQty": 763.49,
        "stockQty": 480.27,
        "cartonsQty": 32
    },
    {
        "itemCode": "04010102121001",
        "itemName": "اسپندکس (کاور 40/100) آبی فیلی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) آبی فیلی",
        "inflowQty": 259.72,
        "outflowQty": 173.02,
        "stockQty": 86.7,
        "cartonsQty": 6
    },
    {
        "itemCode": "04010102131001",
        "itemName": "اسپندکس (کاور 40/100) یاسی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) یاسی",
        "inflowQty": 306.8,
        "outflowQty": 225,
        "stockQty": 81.8,
        "cartonsQty": 5
    },
    {
        "itemCode": "040103011001",
        "itemName": "اسپاندکس 20/100 سفید hb",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپاندکس 20/100 سفید hb",
        "inflowQty": 6229,
        "outflowQty": 1882.09,
        "stockQty": 4346.91,
        "cartonsQty": 290
    },
    {
        "itemCode": "0402010102",
        "itemName": "کش 110F سفید بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 110F سفید بشقابی",
        "inflowQty": 38.72,
        "outflowQty": 38.72,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020101061002",
        "itemName": "کش 110 سفید استوانه",
        "groupName": "کش",
        "subGroupName": "کش 110 سفید استوانه",
        "inflowQty": 55.2,
        "outflowQty": 36.8,
        "stockQty": 18.4,
        "cartonsQty": 1
    },
    {
        "itemCode": "0402010205",
        "itemName": "کش 110S مشکی",
        "groupName": "کش",
        "subGroupName": "کش 110S مشکی",
        "inflowQty": 13320.97,
        "outflowQty": 13168.65,
        "stockQty": 152.32,
        "cartonsQty": 10
    },
    {
        "itemCode": "04020210111002",
        "itemName": "کش 90F مشکی بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 90F مشکی بشقابی",
        "inflowQty": 92467.56,
        "outflowQty": 89334.37,
        "stockQty": 3133.19,
        "cartonsQty": 196
    },
    {
        "itemCode": "040202101110031001",
        "itemName": "کش 90F مشکی استوانه",
        "groupName": "کش",
        "subGroupName": "کش 90F مشکی استوانه",
        "inflowQty": 55.11,
        "outflowQty": 55.11,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0402041002",
        "itemName": "کش 40F سفید",
        "groupName": "کش",
        "subGroupName": "کش 40F سفید",
        "inflowQty": 861.44,
        "outflowQty": 861.44,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0402041003",
        "itemName": "کش 40T سفید",
        "groupName": "کش",
        "subGroupName": "کش 40T سفید",
        "inflowQty": 2690.27,
        "outflowQty": 2690.27,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020410111006",
        "itemName": "کش 40  LN طوسی نقره ای مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN طوسی نقره ای مخروطی (کارمزدی روح بخش)",
        "inflowQty": 44.7,
        "outflowQty": 44.7,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020701",
        "itemName": "شوایتر کش رنگی",
        "groupName": "کش",
        "subGroupName": "شوایتر کش رنگی",
        "inflowQty": 84.6,
        "outflowQty": 0,
        "stockQty": 84.6,
        "cartonsQty": 5
    },
    {
        "itemCode": "040301020201",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 01020201",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 15163.84,
        "outflowQty": 14988.04,
        "stockQty": 175.8,
        "cartonsQty": 10
    },
    {
        "itemCode": "0403010301001",
        "itemName": "ساپورت 40/150 FSE سفید",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "ساپورت 40/150 FSE سفید",
        "inflowQty": 4202.8,
        "outflowQty": 4081.74,
        "stockQty": 121.06,
        "cartonsQty": 7
    },
    {
        "itemCode": "040501041001",
        "itemName": "پلی استر شوایتر 150 قرمز",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 قرمز",
        "inflowQty": 162.42,
        "outflowQty": 162.42,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040502021001",
        "itemName": "پلی استر شوایتر 300 مشکی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 300 مشکی",
        "inflowQty": 3964.68,
        "outflowQty": 3950.92,
        "stockQty": 13.76,
        "cartonsQty": 1
    },
    {
        "itemCode": "010201151001",
        "itemName": "POY - کد 01151001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 258.4,
        "outflowQty": 0,
        "stockQty": 258.4,
        "cartonsQty": 0
    },
    {
        "itemCode": "0102020401",
        "itemName": "POY - کد 020401",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 14504.09,
        "outflowQty": 14504.09,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202071001",
        "itemName": "poy150 آبی",
        "groupName": "POY",
        "subGroupName": "poy150 آبی",
        "inflowQty": 1596.7,
        "outflowQty": 1596.7,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01021010021001",
        "itemName": "POY 180/48 مشکی",
        "groupName": "POY",
        "subGroupName": "POY 180/48 مشکی",
        "inflowQty": 46893.15,
        "outflowQty": 44528.25,
        "stockQty": 2364.9,
        "cartonsQty": 0
    },
    {
        "itemCode": "010215100110011001",
        "itemName": "POY 110/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 110/48 سفید",
        "inflowQty": 1526.96,
        "outflowQty": 763.48,
        "stockQty": 763.48,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301111001",
        "itemName": "پلی استر 100 طوسی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 طوسی",
        "inflowQty": 37.611,
        "outflowQty": 22.541,
        "stockQty": 15.07,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103020501",
        "itemName": "پلی استر 150 کرم",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 کرم",
        "inflowQty": 755.64,
        "outflowQty": 755.64,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021002",
        "itemName": "پلی استر 150/48 طوسی تیره",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/48 طوسی تیره",
        "inflowQty": 31515.074,
        "outflowQty": 26831.334,
        "stockQty": 4683.74,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100103",
        "itemName": "dty یا پلی استر - کد 0221100103",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 57.3,
        "outflowQty": 57.3,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100107",
        "itemName": "dty یا پلی استر - کد 0221100107",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 34.89,
        "outflowQty": 34.89,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010303011001",
        "itemName": "پلی استر 300/96 نخودی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/96 نخودی",
        "inflowQty": 1518.84,
        "outflowQty": 1500.82,
        "stockQty": 18.02,
        "cartonsQty": 0
    },
    {
        "itemCode": "010303021001",
        "itemName": "پلی استر 300 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 سفید",
        "inflowQty": 644517.101,
        "outflowQty": 617056.321,
        "stockQty": 27460.78,
        "cartonsQty": 0
    },
    {
        "itemCode": "010303031001",
        "itemName": "پلی استر 300/48 مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/48 مشکی",
        "inflowQty": 147545.645,
        "outflowQty": 142134.815,
        "stockQty": 5410.83,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103080102",
        "itemName": "پلی استر 600 مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 600 مینگل سفید",
        "inflowQty": 2544.14,
        "outflowQty": 2530.54,
        "stockQty": 13.6,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103090101",
        "itemName": "پلی استر 200 مینگل خاکستری",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 مینگل خاکستری",
        "inflowQty": 4660.47,
        "outflowQty": 4573.63,
        "stockQty": 86.84,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104011001",
        "itemName": "لاستیک - کد 011001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 52229.045,
        "outflowQty": 40089.045,
        "stockQty": 12140,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010102031001",
        "itemName": "اسپندکس (کاور 40/100) قرمز",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) قرمز",
        "inflowQty": 226.16,
        "outflowQty": 226.16,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010102141001",
        "itemName": "اسپندکس (کاور 40/100) صورتی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) صورتی",
        "inflowQty": 1584.68,
        "outflowQty": 1064.31,
        "stockQty": 520.37,
        "cartonsQty": 35
    },
    {
        "itemCode": "04010103051002",
        "itemName": "اسپندکس طوسی (کاور 40/150)",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس طوسی (کاور 40/150)",
        "inflowQty": 123,
        "outflowQty": 61.5,
        "stockQty": 61.5,
        "cartonsQty": 4
    },
    {
        "itemCode": "0402010201",
        "itemName": "کش 110 مشکی",
        "groupName": "کش",
        "subGroupName": "کش 110 مشکی",
        "inflowQty": 114720.68,
        "outflowQty": 97831.88,
        "stockQty": 16888.8,
        "cartonsQty": 1056
    },
    {
        "itemCode": "0402010202",
        "itemName": "کش 110F مشکی",
        "groupName": "کش",
        "subGroupName": "کش 110F مشکی",
        "inflowQty": 115.12,
        "outflowQty": 115.12,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040201091001",
        "itemName": "کش - کد 01091001",
        "groupName": "کش",
        "subGroupName": "",
        "inflowQty": 1233.34,
        "outflowQty": 1233.34,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020210121003",
        "itemName": "کش 90F سفید مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 90F سفید مخروطی",
        "inflowQty": 1095.26,
        "outflowQty": 547.63,
        "stockQty": 547.63,
        "cartonsQty": 34
    },
    {
        "itemCode": "0402041006",
        "itemName": "کش 40L مشکی",
        "groupName": "کش",
        "subGroupName": "کش 40L مشکی",
        "inflowQty": 1626.25,
        "outflowQty": 1620.77,
        "stockQty": 5.48,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020410111005",
        "itemName": "کش 40  LN سبز مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN سبز مخروطی (کارمزدی روح بخش)",
        "inflowQty": 32.48,
        "outflowQty": 32.48,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020410111008",
        "itemName": "کش 40  LN سفید مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN سفید مخروطی (کارمزدی روح بخش)",
        "inflowQty": 563.58,
        "outflowQty": 450.5,
        "stockQty": 113.08,
        "cartonsQty": 7
    },
    {
        "itemCode": "040303041002",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 03041002",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 56.28,
        "outflowQty": 56.28,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040501131001",
        "itemName": "پلی استر شوایتر 150 نخودی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 نخودی",
        "inflowQty": 5188.74,
        "outflowQty": 4442.38,
        "stockQty": 746.36,
        "cartonsQty": 48
    },
    {
        "itemCode": "0405041001",
        "itemName": "پلی استر شوایتر 100سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 100سفید",
        "inflowQty": 6149.7,
        "outflowQty": 5258.48,
        "stockQty": 891.22,
        "cartonsQty": 57
    },
    {
        "itemCode": "04101001",
        "itemName": "FDY - کد 1001",
        "groupName": "FDY",
        "subGroupName": "",
        "inflowQty": 33002.56,
        "outflowQty": 14688,
        "stockQty": 18314.56,
        "cartonsQty": 916
    },
    {
        "itemCode": "010203021002",
        "itemName": "POY 500/96 مشکی",
        "groupName": "POY",
        "subGroupName": "POY 500/96 مشکی",
        "inflowQty": 101728.34,
        "outflowQty": 101728.34,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010203031002",
        "itemName": "POY - کد 03031002",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 1518.8,
        "outflowQty": 1518.8,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103020110031002",
        "itemName": "پلی استر 150/96 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/96 سفید",
        "inflowQty": 490,
        "outflowQty": 245,
        "stockQty": 245,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100106",
        "itemName": "dty یا پلی استر - کد 0221100106",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 43.48,
        "outflowQty": 43.48,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103051001",
        "itemName": "پلی استر 150 دودی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 دودی",
        "inflowQty": 30586.58,
        "outflowQty": 28173.83,
        "stockQty": 2412.75,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103080101",
        "itemName": "dty یا پلی استر - کد 080101",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 50.01,
        "outflowQty": 0,
        "stockQty": 50.01,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103090102",
        "itemName": "پلی استر 200 مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 مینگل سفید",
        "inflowQty": 2727.04,
        "outflowQty": 2286.12,
        "stockQty": 440.92,
        "cartonsQty": 0
    },
    {
        "itemCode": "0106041001",
        "itemName": "پلی استر اسپان - کد 041001",
        "groupName": "پلی استر اسپان",
        "subGroupName": "",
        "inflowQty": 3328,
        "outflowQty": 3328,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010102021001",
        "itemName": "اسپندکس (کاور 40/100) مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) مشکی",
        "inflowQty": 66061.81,
        "outflowQty": 58347.61,
        "stockQty": 7714.2,
        "cartonsQty": 514
    },
    {
        "itemCode": "040101020502",
        "itemName": "اسپندکس (کاور 40/100) آبی لی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) آبی لی",
        "inflowQty": 505.7,
        "outflowQty": 341.38,
        "stockQty": 164.32,
        "cartonsQty": 11
    },
    {
        "itemCode": "040101020801",
        "itemName": "اسپندکس (کاور 40/100) گلی مات",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) گلی مات",
        "inflowQty": 5436.94,
        "outflowQty": 5436.94,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0401010610011001",
        "itemName": "اسپندکس (کاور 40/120) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/120) سفید",
        "inflowQty": 47594.84,
        "outflowQty": 43790.28,
        "stockQty": 3804.56,
        "cartonsQty": 254
    },
    {
        "itemCode": "04020101081001",
        "itemName": "کش 110S سفید بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 110S سفید بشقابی",
        "inflowQty": 29.26,
        "outflowQty": 29.26,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020101081002",
        "itemName": "کش 110S سفید استوانه",
        "groupName": "کش",
        "subGroupName": "کش 110S سفید استوانه",
        "inflowQty": 29326.33,
        "outflowQty": 24643.01,
        "stockQty": 4683.32,
        "cartonsQty": 293
    },
    {
        "itemCode": "0402010402",
        "itemName": "کش 110 طوسی",
        "groupName": "کش",
        "subGroupName": "کش 110 طوسی",
        "inflowQty": 14950.03,
        "outflowQty": 13048.88,
        "stockQty": 1901.15,
        "cartonsQty": 119
    },
    {
        "itemCode": "0402041008",
        "itemName": "کش 40  LN قرمز مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 40  LN قرمز مخروطی",
        "inflowQty": 328.75,
        "outflowQty": 309.08,
        "stockQty": 19.67,
        "cartonsQty": 1
    },
    {
        "itemCode": "04020410111007",
        "itemName": "کش 40  LN مشکی مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN مشکی مخروطی (کارمزدی روح بخش)",
        "inflowQty": 1322.82,
        "outflowQty": 1322.82,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040303020101",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 03020101",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 984.75,
        "outflowQty": 457.08,
        "stockQty": 527.67,
        "cartonsQty": 31
    },
    {
        "itemCode": "040303030101",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 03030101",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 6502.15,
        "outflowQty": 5697.94,
        "stockQty": 804.21,
        "cartonsQty": 47
    },
    {
        "itemCode": "040502051001",
        "itemName": "پلی استر شوایتر - کد 02051001",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "",
        "inflowQty": 145.72,
        "outflowQty": 145.72,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0405031002",
        "itemName": "پلی استر شوایتر 100سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 100سفید",
        "inflowQty": 1046.34,
        "outflowQty": 1019.18,
        "stockQty": 27.16,
        "cartonsQty": 2
    },
    {
        "itemCode": "0405051002",
        "itemName": "پلی استر شوایتر 150 مشکی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 مشکی",
        "inflowQty": 966.76,
        "outflowQty": 966.76,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01011001",
        "itemName": "چیپس - کد 1001",
        "groupName": "چیپس",
        "subGroupName": "",
        "inflowQty": 2268661.25,
        "outflowQty": 2104785.087,
        "stockQty": 163876.163,
        "cartonsQty": 0
    },
    {
        "itemCode": "010203021001",
        "itemName": "POY - کد 03021001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 44545.4,
        "outflowQty": 44545.4,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01021110011001",
        "itemName": "POY 200/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 200/48 سفید",
        "inflowQty": 0.1,
        "outflowQty": 0.1,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301231001",
        "itemName": "dty یا پلی استر - کد 01231001",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 676,
        "outflowQty": 676,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302031001",
        "itemName": "پلی استر 150 نخودی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 نخودی",
        "inflowQty": 103193.953,
        "outflowQty": 101529.813,
        "stockQty": 1664.14,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021003",
        "itemName": "پلی استر 150/48 طوسی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/48 طوسی",
        "inflowQty": 1460.18,
        "outflowQty": 1460.18,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302141002",
        "itemName": "پلی استر 150 قهوه ای سوخته",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 قهوه ای سوخته",
        "inflowQty": 794.81,
        "outflowQty": 794.81,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100102",
        "itemName": "dty یا پلی استر - کد 0221100102",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 114.513,
        "outflowQty": 114.513,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103090103",
        "itemName": "پلی استر 200 مینگل مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 مینگل مشکی",
        "inflowQty": 57.78,
        "outflowQty": 0,
        "stockQty": 57.78,
        "cartonsQty": 0
    },
    {
        "itemCode": "010310100110021001",
        "itemName": "پلی استر 75 مشکی مصرفی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 75 مشکی مصرفی",
        "inflowQty": 1.028,
        "outflowQty": 1.028,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031210011002",
        "itemName": "پلی استر 120سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 120سفید",
        "inflowQty": 681.02,
        "outflowQty": 0,
        "stockQty": 681.02,
        "cartonsQty": 0
    },
    {
        "itemCode": "0105100810011001",
        "itemName": "لاکرا - کد 100810011001",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 192,
        "outflowQty": 192,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01071001001",
        "itemName": "مستر بچ - کد 1001001",
        "groupName": "مستر بچ",
        "subGroupName": "",
        "inflowQty": 15204,
        "outflowQty": 11019.851,
        "stockQty": 4184.149,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010102011001",
        "itemName": "اسپندکس (کاور 40/100) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) سفید",
        "inflowQty": 16021.69,
        "outflowQty": 14539.29,
        "stockQty": 1482.4,
        "cartonsQty": 99
    },
    {
        "itemCode": "04010102011002",
        "itemName": "اسپاندکس (کاور) - کد 0102011002",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "",
        "inflowQty": 143.13,
        "outflowQty": 102.03,
        "stockQty": 41.1,
        "cartonsQty": 3
    },
    {
        "itemCode": "04010102151001",
        "itemName": "اسپندکس (کاور 40/100) قهوه ای",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) قهوه ای",
        "inflowQty": 883.69,
        "outflowQty": 873.83,
        "stockQty": 9.86,
        "cartonsQty": 1
    },
    {
        "itemCode": "04010103071001",
        "itemName": "اسپندکس (کاور 40/150) آبی شالی FSE",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/150) آبی شالی FSE",
        "inflowQty": 6094.36,
        "outflowQty": 3513.17,
        "stockQty": 2581.19,
        "cartonsQty": 172
    },
    {
        "itemCode": "0401010610021001",
        "itemName": "اسپندکس (کاور 40/120) مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/120) مشکی",
        "inflowQty": 12602.96,
        "outflowQty": 12572.49,
        "stockQty": 30.47,
        "cartonsQty": 2
    },
    {
        "itemCode": "0401020410021001",
        "itemName": "اسپندکس (کاور 30/120) مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/120) مشکی",
        "inflowQty": 7038.31,
        "outflowQty": 7038.31,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040103011004",
        "itemName": "اسپاندکس 20/75 سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپاندکس 20/75 سفید",
        "inflowQty": 942.62,
        "outflowQty": 920.43,
        "stockQty": 22.19,
        "cartonsQty": 1
    },
    {
        "itemCode": "0402010101",
        "itemName": "کش 110 سفید بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 110 سفید بشقابی",
        "inflowQty": 1389.8,
        "outflowQty": 1080.32,
        "stockQty": 309.48,
        "cartonsQty": 19
    },
    {
        "itemCode": "0402010105",
        "itemName": "کش 110S سفید بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 110S سفید بشقابی",
        "inflowQty": 161177.08,
        "outflowQty": 138513.49,
        "stockQty": 22663.59,
        "cartonsQty": 1416
    },
    {
        "itemCode": "0402041007",
        "itemName": "کش 40  LN زرد فسفری مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 40  LN زرد فسفری مخروطی",
        "inflowQty": 1242.32,
        "outflowQty": 1242.32,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020410111001",
        "itemName": "کش 40  LN قرمز مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN قرمز مخروطی (کارمزدی روح بخش)",
        "inflowQty": 121.3,
        "outflowQty": 121.3,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0405010501",
        "itemName": "پلی استر شوایتر 150 طوسی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 طوسی",
        "inflowQty": 439.68,
        "outflowQty": 439.68,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040501171001",
        "itemName": "پلی استر شوایتر 150 دودی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 دودی",
        "inflowQty": 748.9,
        "outflowQty": 698.7,
        "stockQty": 50.2,
        "cartonsQty": 3
    },
    {
        "itemCode": "040502011001",
        "itemName": "پلی استر شوایتر 300 سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 300 سفید",
        "inflowQty": 1609.58,
        "outflowQty": 1609.58,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0405051001",
        "itemName": "پلی استر شوایتر 150 سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 سفید",
        "inflowQty": 4946.12,
        "outflowQty": 3027.13,
        "stockQty": 1918.99,
        "cartonsQty": 124
    },
    {
        "itemCode": "010201031001",
        "itemName": "POY 160/48 مشکی",
        "groupName": "POY",
        "subGroupName": "POY 160/48 مشکی",
        "inflowQty": 209839.535,
        "outflowQty": 204179.555,
        "stockQty": 5659.98,
        "cartonsQty": 0
    },
    {
        "itemCode": "010203011002",
        "itemName": "POY 500/96 سفید",
        "groupName": "POY",
        "subGroupName": "POY 500/96 سفید",
        "inflowQty": 832619.665,
        "outflowQty": 815355.125,
        "stockQty": 17264.54,
        "cartonsQty": 0
    },
    {
        "itemCode": "010203040101",
        "itemName": "POY - کد 03040101",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 789.5,
        "outflowQty": 789.5,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01021010011001",
        "itemName": "POY 180/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 180/48 سفید",
        "inflowQty": 275096.177,
        "outflowQty": 252165.377,
        "stockQty": 22930.8,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301011003",
        "itemName": "پلی استر 100 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 سفید",
        "inflowQty": 1690.72,
        "outflowQty": 1122.54,
        "stockQty": 568.18,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103010801",
        "itemName": "پلی استر 100 آبی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 آبی",
        "inflowQty": 35.64,
        "outflowQty": 35.64,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302011001",
        "itemName": "پلی استر 150 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 سفید",
        "inflowQty": 651481.99,
        "outflowQty": 607847.27,
        "stockQty": 43634.72,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302021001",
        "itemName": "پلی استر 150 مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 مشکی",
        "inflowQty": 337222.75,
        "outflowQty": 323920.04,
        "stockQty": 13302.71,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302171001",
        "itemName": "پلی استر 150 کرم باندی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 کرم باندی",
        "inflowQty": 126443.46,
        "outflowQty": 119055.17,
        "stockQty": 7388.29,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100104",
        "itemName": "dty یا پلی استر - کد 0221100104",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 32.18,
        "outflowQty": 32.18,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103030702",
        "itemName": "پلی استر پرچمی 300",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر پرچمی 300",
        "inflowQty": 303.56,
        "outflowQty": 303.56,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010309041001",
        "itemName": "پلی استر 150 مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 مینگل سفید",
        "inflowQty": 35.74,
        "outflowQty": 0,
        "stockQty": 35.74,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031210011001",
        "itemName": "پلی استر 120سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 120سفید",
        "inflowQty": 298043.552,
        "outflowQty": 280485.932,
        "stockQty": 17557.62,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031410011001",
        "itemName": "پلی استر 130سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 130سفید",
        "inflowQty": 1011.4,
        "outflowQty": 0,
        "stockQty": 1011.4,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100210011002",
        "itemName": "پلی استر 200 کو مینگل خاکستری",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 کو مینگل خاکستری",
        "inflowQty": 3395.5,
        "outflowQty": 3176.5,
        "stockQty": 219,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100210021001",
        "itemName": "پلی استر 200 کو مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 کو مینگل سفید",
        "inflowQty": 23112.7,
        "outflowQty": 21162.59,
        "stockQty": 1950.11,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104021001",
        "itemName": "لاستیک - کد 021001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 620,
        "outflowQty": 580,
        "stockQty": 40,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104031002",
        "itemName": "لاستیک - کد 031002",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 333.6,
        "outflowQty": 333.6,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104061001",
        "itemName": "لاستیک - کد 061001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 0,
        "outflowQty": 0,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051003",
        "itemName": "لاکرا - کد 1003",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 15932.434,
        "outflowQty": 15437.434,
        "stockQty": 495,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051004",
        "itemName": "لاکرا - کد 1004",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 4034.62,
        "outflowQty": 4026,
        "stockQty": 8.62,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101020501",
        "itemName": "اسپندکس (کاور 40/100) آبی شالی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) آبی شالی",
        "inflowQty": 1093.28,
        "outflowQty": 1093.28,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101020603",
        "itemName": "اسپندکس (کاور 40/100) طوسی مات",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) طوسی مات",
        "inflowQty": 582.12,
        "outflowQty": 208.53,
        "stockQty": 373.59,
        "cartonsQty": 25
    },
    {
        "itemCode": "040101020902",
        "itemName": "اسپاندکس (کاور) - کد 01020902",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "",
        "inflowQty": 203.74,
        "outflowQty": 203.74,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010103051001",
        "itemName": "اسپندکس طوسی تیره (کاور 40/150)",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس طوسی تیره (کاور 40/150)",
        "inflowQty": 1263.93,
        "outflowQty": 1263.93,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010103061001",
        "itemName": "اسپندکس قهوه ای (کاور 40/150)",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس قهوه ای (کاور 40/150)",
        "inflowQty": 76.96,
        "outflowQty": 38.48,
        "stockQty": 38.48,
        "cartonsQty": 3
    },
    {
        "itemCode": "040103021001",
        "itemName": "اسپاندکس 20/100 مشکی hb",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپاندکس 20/100 مشکی hb",
        "inflowQty": 9316.78,
        "outflowQty": 7812.95,
        "stockQty": 1503.83,
        "cartonsQty": 100
    },
    {
        "itemCode": "040103021004",
        "itemName": "اسپاندکس 20/75 مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپاندکس 20/75 مشکی",
        "inflowQty": 1142.64,
        "outflowQty": 1142.64,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020410091001",
        "itemName": "کش 40F مشکی بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 40F مشکی بشقابی",
        "inflowQty": 1740.38,
        "outflowQty": 1740.38,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020601",
        "itemName": "کش - کد 0601",
        "groupName": "کش",
        "subGroupName": "",
        "inflowQty": 67.95,
        "outflowQty": 0,
        "stockQty": 67.95,
        "cartonsQty": 4
    },
    {
        "itemCode": "04020602",
        "itemName": "کش - کد 0602",
        "groupName": "کش",
        "subGroupName": "",
        "inflowQty": 9.7,
        "outflowQty": 0,
        "stockQty": 9.7,
        "cartonsQty": 1
    },
    {
        "itemCode": "040301020101",
        "itemName": "ساپورت 40/100 HF سفید",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "ساپورت 40/100 HF سفید",
        "inflowQty": 51739.792,
        "outflowQty": 50376.102,
        "stockQty": 1363.69,
        "cartonsQty": 80
    },
    {
        "itemCode": "040301030201",
        "itemName": "ساپورت 40/150 FSE مشکی",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "ساپورت 40/150 FSE مشکی",
        "inflowQty": 5103.112,
        "outflowQty": 5103.112,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040501031001",
        "itemName": "پلی استر شوایتر 150 آبی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 آبی",
        "inflowQty": 109.32,
        "outflowQty": 109.32,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040501181001",
        "itemName": "پلی استر شوایتر 150 طوسی تیره",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 طوسی تیره",
        "inflowQty": 648.54,
        "outflowQty": 648.54,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04081001",
        "itemName": "نخ ملت - کد 1001",
        "groupName": "نخ ملت",
        "subGroupName": "",
        "inflowQty": 2684.2,
        "outflowQty": 2684.2,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202031001",
        "itemName": "POY - کد 02031001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 89379.6,
        "outflowQty": 89379.6,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0102020501",
        "itemName": "POY - کد 020501",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 1025.4,
        "outflowQty": 1025.4,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010203011001",
        "itemName": "POY 500/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 500/48 سفید",
        "inflowQty": 24800.168,
        "outflowQty": 24800.168,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01021210011001",
        "itemName": "POY 320/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 320/48 سفید",
        "inflowQty": 2000.66,
        "outflowQty": 2000.66,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301011001",
        "itemName": "پلی استر 100 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 سفید",
        "inflowQty": 264389.653,
        "outflowQty": 216880.013,
        "stockQty": 47509.64,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103012001",
        "itemName": "پلی استر 100 گلی مصرفی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 گلی مصرفی",
        "inflowQty": 20.98,
        "outflowQty": 20.98,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103020110031001",
        "itemName": "پلی استر 150/96 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/96 سفید",
        "inflowQty": 8713.94,
        "outflowQty": 8172,
        "stockQty": 541.94,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302081002",
        "itemName": "پلی استر 150 سبز لجنی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 سبز لجنی",
        "inflowQty": 8591.94,
        "outflowQty": 8591.94,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021901",
        "itemName": "پلی استر 150 کالباسی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 کالباسی",
        "inflowQty": 4567.11,
        "outflowQty": 1947.24,
        "stockQty": 2619.87,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100101",
        "itemName": "dty یا پلی استر - کد 0221100101",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 506.82,
        "outflowQty": 506.82,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010310100110011001",
        "itemName": "پلی استر 75 سفید مصرفی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 75 سفید مصرفی",
        "inflowQty": 0.925,
        "outflowQty": 0.925,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031510011001",
        "itemName": "پلی استر 300 کو مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 کو مینگل سفید",
        "inflowQty": 14544.74,
        "outflowQty": 13132.72,
        "stockQty": 1412.02,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100110031001",
        "itemName": "پلی استر 300 کو مینگل مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 کو مینگل مشکی",
        "inflowQty": 10419.3,
        "outflowQty": 10351.46,
        "stockQty": 67.84,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100210011001",
        "itemName": "پلی استر 200 کو مینگل خاکستری",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 کو مینگل خاکستری",
        "inflowQty": 21678.368,
        "outflowQty": 19763.048,
        "stockQty": 1915.32,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100310011001",
        "itemName": "پلی استر 600 کو مینگل خاکستری",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 600 کو مینگل خاکستری",
        "inflowQty": 4373.68,
        "outflowQty": 4307.18,
        "stockQty": 66.5,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104031001",
        "itemName": "لاستیک - کد 031001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 7099,
        "outflowQty": 3774.74,
        "stockQty": 3324.26,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104051001",
        "itemName": "لاستیک - کد 051001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 65585.179,
        "outflowQty": 58925.179,
        "stockQty": 6660,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101020703",
        "itemName": "اسپندکس (40/100) یشمی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (40/100) یشمی",
        "inflowQty": 146.96,
        "outflowQty": 146.96,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101020901",
        "itemName": "اسپندکس (کاور 40/100) زرد مات",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) زرد مات",
        "inflowQty": 322.75,
        "outflowQty": 322.75,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0401010210001",
        "itemName": "اسپندکس (کاور 40/100) سرمه ای",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) سرمه ای",
        "inflowQty": 1129.92,
        "outflowQty": 616.74,
        "stockQty": 513.18,
        "cartonsQty": 34
    },
    {
        "itemCode": "040101030401",
        "itemName": "اسپندکس (کاور 40/150) نخودی FSE",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/150) نخودی FSE",
        "inflowQty": 11432.38,
        "outflowQty": 9913.27,
        "stockQty": 1519.11,
        "cartonsQty": 101
    },
    {
        "itemCode": "0401020410011001",
        "itemName": "اسپندکس (کاور 30/120) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/120) سفید",
        "inflowQty": 40092.06,
        "outflowQty": 27930.9,
        "stockQty": 12161.16,
        "cartonsQty": 811
    },
    {
        "itemCode": "04020210121001",
        "itemName": "کش 90 سفید",
        "groupName": "کش",
        "subGroupName": "کش 90 سفید",
        "inflowQty": 56.7,
        "outflowQty": 37.8,
        "stockQty": 18.9,
        "cartonsQty": 1
    },
    {
        "itemCode": "04020410091002",
        "itemName": "کش 40F مشکی استوانه",
        "groupName": "کش",
        "subGroupName": "کش 40F مشکی استوانه",
        "inflowQty": 20.5,
        "outflowQty": 20.5,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020410111002",
        "itemName": "کش 40  LN بنفش مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN بنفش مخروطی (کارمزدی روح بخش)",
        "inflowQty": 360.68,
        "outflowQty": 360.68,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020410111004",
        "itemName": "کش 40  LN آبی مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN آبی مخروطی (کارمزدی روح بخش)",
        "inflowQty": 43.84,
        "outflowQty": 43.84,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040301020102",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 01020102",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 6555.82,
        "outflowQty": 6555.82,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040501111001",
        "itemName": "پلی استر شوایتر 150 قهوه ای",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 قهوه ای",
        "inflowQty": 155.88,
        "outflowQty": 155.88,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040501191001",
        "itemName": "پلی استر شوایتر 150 کالباسی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 کالباسی",
        "inflowQty": 13.8,
        "outflowQty": 13.8,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0405031001",
        "itemName": "پلی استر شوایتر 100مشکی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 100مشکی",
        "inflowQty": 799.16,
        "outflowQty": 799.16,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0405071001",
        "itemName": "پلی استر شوایتر رنگارنگ",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر رنگارنگ",
        "inflowQty": 224.56,
        "outflowQty": 183.26,
        "stockQty": 41.3,
        "cartonsQty": 3
    },
    {
        "itemCode": "010201021001",
        "itemName": "POY 160/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 160/48 سفید",
        "inflowQty": 651755.955,
        "outflowQty": 633795.435,
        "stockQty": 17960.52,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202011001",
        "itemName": "POY 250/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 250/48 سفید",
        "inflowQty": 1215163.119,
        "outflowQty": 1186319.749,
        "stockQty": 28843.37,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202040201",
        "itemName": "POY - کد 02040201",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 27564.25,
        "outflowQty": 27564.25,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202071002",
        "itemName": "POY - کد 02071002",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 1596.7,
        "outflowQty": 1596.7,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202121001",
        "itemName": "POY - کد 02121001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 3924.35,
        "outflowQty": 3924.35,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202121002",
        "itemName": "POY - کد 02121002",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 7639.4,
        "outflowQty": 7639.4,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010203061001",
        "itemName": "POY - کد 03061001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 3194.4,
        "outflowQty": 3194.4,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302011002",
        "itemName": "پلی استر 150 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 سفید",
        "inflowQty": 168447.95,
        "outflowQty": 146650.35,
        "stockQty": 21797.6,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103020401",
        "itemName": "پلی استر 150 قرمز",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 قرمز",
        "inflowQty": 12031.35,
        "outflowQty": 12031.35,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030803100110011001",
        "itemName": "پلی استر 600 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 600 سفید",
        "inflowQty": 30.04,
        "outflowQty": 15.02,
        "stockQty": 15.02,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031210021001",
        "itemName": "پلی استر 120مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 120مشکی",
        "inflowQty": 29501.157,
        "outflowQty": 29501.157,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104061002",
        "itemName": "لاستیک - کد 061002",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 440,
        "outflowQty": 0,
        "stockQty": 440,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104071001",
        "itemName": "لاستیک - کد 071001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 120,
        "outflowQty": 0,
        "stockQty": 120,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051005",
        "itemName": "لاکرا - کد 1005",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 164.975,
        "outflowQty": 97.15,
        "stockQty": 67.825,
        "cartonsQty": 0
    },
    {
        "itemCode": "010601",
        "itemName": "پلی استر اسپان - کد 01",
        "groupName": "پلی استر اسپان",
        "subGroupName": "",
        "inflowQty": 419927.04,
        "outflowQty": 237519.36,
        "stockQty": 182407.68,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101020602",
        "itemName": "اسپندکس (کاور 40/100) طوسی تیره",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) طوسی تیره",
        "inflowQty": 104.94,
        "outflowQty": 84.34,
        "stockQty": 20.6,
        "cartonsQty": 1
    },
    {
        "itemCode": "040101020702",
        "itemName": "اسپندکس (40/100) سبز چمنی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (40/100) سبز چمنی",
        "inflowQty": 370.13,
        "outflowQty": 370.13,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0401010211001",
        "itemName": "اسپاندکس (کاور) - کد 010211001",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "",
        "inflowQty": 23.64,
        "outflowQty": 23.64,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010202021001",
        "itemName": "اسپندکس (کاور 30/100) مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/100) مشکی",
        "inflowQty": 39793.56,
        "outflowQty": 36668.89,
        "stockQty": 3124.67,
        "cartonsQty": 208
    },
    {
        "itemCode": "04010202041001",
        "itemName": "اسپاندکس (کاور) - کد 0202041001",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "",
        "inflowQty": 210.03,
        "outflowQty": 210.03,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040201020601",
        "itemName": "کش 110 مشکی استوانه",
        "groupName": "کش",
        "subGroupName": "کش 110 مشکی استوانه",
        "inflowQty": 2259.09,
        "outflowQty": 2259.09,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040201031001",
        "itemName": "کش 110 قرمز",
        "groupName": "کش",
        "subGroupName": "کش 110 قرمز",
        "inflowQty": 141,
        "outflowQty": 141,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04020210121002",
        "itemName": "کش 90F سفید",
        "groupName": "کش",
        "subGroupName": "کش 90F سفید",
        "inflowQty": 96436.7,
        "outflowQty": 90844.5,
        "stockQty": 5592.2,
        "cartonsQty": 350
    },
    {
        "itemCode": "04020410111003",
        "itemName": "کش 40  LN صورتی مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN صورتی مخروطی (کارمزدی روح بخش)",
        "inflowQty": 59.64,
        "outflowQty": 59.64,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040303030201",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 03030201",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 9087.91,
        "outflowQty": 7646.18,
        "stockQty": 1441.73,
        "cartonsQty": 85
    },
    {
        "itemCode": "040501021001",
        "itemName": "پلی استر شوایتر 150 مشکی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 مشکی",
        "inflowQty": 33633.31,
        "outflowQty": 32951.51,
        "stockQty": 681.8,
        "cartonsQty": 44
    },
    {
        "itemCode": "0405031005",
        "itemName": "پلی استر شوایتر - کد 031005",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "",
        "inflowQty": 610.34,
        "outflowQty": 0,
        "stockQty": 610.34,
        "cartonsQty": 39
    },
    {
        "itemCode": "0405041002",
        "itemName": "پلی استر شوایتر 100مشکی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 100مشکی",
        "inflowQty": 2209.5,
        "outflowQty": 1470.2,
        "stockQty": 739.3,
        "cartonsQty": 48
    },
    {
        "itemCode": "04091001",
        "itemName": "الیاف - کد 1001",
        "groupName": "الیاف",
        "subGroupName": "",
        "inflowQty": 53004.202,
        "outflowQty": 53004.202,
        "stockQty": 0,
        "cartonsQty": 0
    }
];
    const currentStock = [
    {
        "itemCode": "01011001",
        "itemName": "چیپس - کد 1001",
        "groupName": "چیپس",
        "subGroupName": "",
        "inflowQty": 1224642.163,
        "outflowQty": 960761.778,
        "stockQty": 164436.058,
        "cartonsQty": 0
    },
    {
        "itemCode": "010201021001",
        "itemName": "POY 160/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 160/48 سفید",
        "inflowQty": 390807.13,
        "outflowQty": 304403.97,
        "stockQty": 86403.16,
        "cartonsQty": 0
    },
    {
        "itemCode": "010201031001",
        "itemName": "POY 160/48 مشکی",
        "groupName": "POY",
        "subGroupName": "POY 160/48 مشکی",
        "inflowQty": 21143.94,
        "outflowQty": 22088.357,
        "stockQty": -944.417,
        "cartonsQty": 0
    },
    {
        "itemCode": "010201151001",
        "itemName": "POY - کد 01151001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 258.4,
        "outflowQty": 0,
        "stockQty": 258.4,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202011001",
        "itemName": "POY 250/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 250/48 سفید",
        "inflowQty": 413543.7,
        "outflowQty": 402594.05,
        "stockQty": 10949.65,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202011002",
        "itemName": "POY 250/96 سفید",
        "groupName": "POY",
        "subGroupName": "POY 250/96 سفید",
        "inflowQty": 44267.76,
        "outflowQty": 22133.88,
        "stockQty": 22133.88,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202021001",
        "itemName": "POY 250/48 مشکی",
        "groupName": "POY",
        "subGroupName": "POY 250/48 مشکی",
        "inflowQty": 103943.24,
        "outflowQty": 101128.608,
        "stockQty": 2814.632,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202031001",
        "itemName": "POY - کد 02031001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 17544.4,
        "outflowQty": 17476.73,
        "stockQty": 67.67,
        "cartonsQty": 0
    },
    {
        "itemCode": "0102020401",
        "itemName": "POY - کد 020401",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 3210,
        "outflowQty": 3964.88,
        "stockQty": -754.88,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202040201",
        "itemName": "POY - کد 02040201",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 3176.8,
        "outflowQty": 3093.43,
        "stockQty": 83.37,
        "cartonsQty": 0
    },
    {
        "itemCode": "0102020501",
        "itemName": "POY - کد 020501",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 4965,
        "outflowQty": 4911.92,
        "stockQty": 53.08,
        "cartonsQty": 0
    },
    {
        "itemCode": "0102020601",
        "itemName": "POY - کد 020601",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 23175.6,
        "outflowQty": 23959.65,
        "stockQty": -784.05,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202091001",
        "itemName": "POY - کد 02091001",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 6582.4,
        "outflowQty": 6756.46,
        "stockQty": -174.06,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202091002",
        "itemName": "POY - کد 02091002",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 2831,
        "outflowQty": 2762.55,
        "stockQty": 68.45,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202140101",
        "itemName": "POY - کد 02140101",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 7465.4,
        "outflowQty": 7449.01,
        "stockQty": 16.39,
        "cartonsQty": 0
    },
    {
        "itemCode": "010202160101",
        "itemName": "POY - کد 02160101",
        "groupName": "POY",
        "subGroupName": "",
        "inflowQty": 6318.4,
        "outflowQty": 6923.99,
        "stockQty": -605.59,
        "cartonsQty": 0
    },
    {
        "itemCode": "010203011002",
        "itemName": "POY 500/96 سفید",
        "groupName": "POY",
        "subGroupName": "POY 500/96 سفید",
        "inflowQty": 293239.72,
        "outflowQty": 290935.794,
        "stockQty": 2303.926,
        "cartonsQty": 0
    },
    {
        "itemCode": "010203021002",
        "itemName": "POY 500/96 مشکی",
        "groupName": "POY",
        "subGroupName": "POY 500/96 مشکی",
        "inflowQty": 8038.2,
        "outflowQty": 7927.85,
        "stockQty": 110.35,
        "cartonsQty": 0
    },
    {
        "itemCode": "0102090101",
        "itemName": "POY 160/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 160/48 سفید",
        "inflowQty": 0,
        "outflowQty": 307.633,
        "stockQty": -307.633,
        "cartonsQty": 0
    },
    {
        "itemCode": "01021010011001",
        "itemName": "POY 180/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 180/48 سفید",
        "inflowQty": 80267.9,
        "outflowQty": 72713.346,
        "stockQty": 7554.554,
        "cartonsQty": 0
    },
    {
        "itemCode": "01021010021001",
        "itemName": "POY 180/48 مشکی",
        "groupName": "POY",
        "subGroupName": "POY 180/48 مشکی",
        "inflowQty": 164745.86,
        "outflowQty": 152280.971,
        "stockQty": 12464.889,
        "cartonsQty": 0
    },
    {
        "itemCode": "01021210011001",
        "itemName": "POY 320/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 320/48 سفید",
        "inflowQty": 8238.36,
        "outflowQty": 11522.097,
        "stockQty": -3283.737,
        "cartonsQty": 0
    },
    {
        "itemCode": "01021210021001",
        "itemName": "POY 320/96 سفید",
        "groupName": "POY",
        "subGroupName": "POY 320/96 سفید",
        "inflowQty": 3613,
        "outflowQty": 1806.5,
        "stockQty": 1806.5,
        "cartonsQty": 0
    },
    {
        "itemCode": "010214100110011001",
        "itemName": "POY 75/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 75/48 سفید",
        "inflowQty": 1711.66,
        "outflowQty": 0,
        "stockQty": 1711.66,
        "cartonsQty": 0
    },
    {
        "itemCode": "010215100110011001",
        "itemName": "POY 110/48 سفید",
        "groupName": "POY",
        "subGroupName": "POY 110/48 سفید",
        "inflowQty": 1526.96,
        "outflowQty": 763.48,
        "stockQty": 763.48,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301011001",
        "itemName": "پلی استر 100 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 سفید",
        "inflowQty": 238625.792,
        "outflowQty": 219277.199,
        "stockQty": 19348.593,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301011003",
        "itemName": "پلی استر 100 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 سفید",
        "inflowQty": 2715.26,
        "outflowQty": 1996.07,
        "stockQty": 719.19,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301021001",
        "itemName": "پلی استر 100 مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 مشکی",
        "inflowQty": 14978.86,
        "outflowQty": 19580.452,
        "stockQty": -4601.592,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301021002",
        "itemName": "پلی استر 100 ذغالی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 ذغالی",
        "inflowQty": 358.32,
        "outflowQty": 179.16,
        "stockQty": 179.16,
        "cartonsQty": 0
    },
    {
        "itemCode": "010301111001",
        "itemName": "پلی استر 100 طوسی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 100 طوسی",
        "inflowQty": 15.07,
        "outflowQty": 0,
        "stockQty": 15.07,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302011001",
        "itemName": "پلی استر 150 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 سفید",
        "inflowQty": 332033.69,
        "outflowQty": 334201.302,
        "stockQty": -2167.612,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302011002",
        "itemName": "پلی استر 150 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 سفید",
        "inflowQty": 54043.8,
        "outflowQty": 46159.27,
        "stockQty": 7884.53,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103020110031001",
        "itemName": "پلی استر 150/96 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/96 سفید",
        "inflowQty": 1448.66,
        "outflowQty": 906.72,
        "stockQty": 541.94,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103020110031002",
        "itemName": "پلی استر 150/96 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/96 سفید",
        "inflowQty": 490,
        "outflowQty": 245,
        "stockQty": 245,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302021001",
        "itemName": "پلی استر 150 مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 مشکی",
        "inflowQty": 88299.7,
        "outflowQty": 91792.694,
        "stockQty": -3492.994,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302031001",
        "itemName": "پلی استر 150 نخودی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 نخودی",
        "inflowQty": 20009.66,
        "outflowQty": 19789.6,
        "stockQty": 220.06,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103020401",
        "itemName": "پلی استر 150 قرمز",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 قرمز",
        "inflowQty": 10704.16,
        "outflowQty": 9795.49,
        "stockQty": 908.67,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302081001",
        "itemName": "پلی استر 150 سبز",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 سبز",
        "inflowQty": 874.22,
        "outflowQty": 818.76,
        "stockQty": 55.46,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021001",
        "itemName": "پلی استر 150/48 طوسی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/48 طوسی",
        "inflowQty": 4115.4,
        "outflowQty": 3708.47,
        "stockQty": 406.93,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021002",
        "itemName": "پلی استر 150/48 طوسی تیره",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150/48 طوسی تیره",
        "inflowQty": 8877.58,
        "outflowQty": 8565.192,
        "stockQty": 312.388,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021101",
        "itemName": "dty یا پلی استر - کد 021101",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 4978.78,
        "outflowQty": 3708.56,
        "stockQty": 1270.22,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302141001",
        "itemName": "پلی استر 150 قهوه ای",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 قهوه ای",
        "inflowQty": 8314.72,
        "outflowQty": 5623.59,
        "stockQty": 2691.13,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302141002",
        "itemName": "پلی استر 150 قهوه ای سوخته",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 قهوه ای سوخته",
        "inflowQty": 2735.16,
        "outflowQty": 2222.86,
        "stockQty": 512.3,
        "cartonsQty": 0
    },
    {
        "itemCode": "010302171001",
        "itemName": "پلی استر 150 کرم باندی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 کرم باندی",
        "inflowQty": 33891.27,
        "outflowQty": 32772.36,
        "stockQty": 1118.91,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103021901",
        "itemName": "پلی استر 150 کالباسی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 کالباسی",
        "inflowQty": 2619.87,
        "outflowQty": 1301.37,
        "stockQty": 1318.5,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030221100108",
        "itemName": "dty یا پلی استر - کد 0221100108",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 0.003,
        "outflowQty": 0,
        "stockQty": 0.003,
        "cartonsQty": 0
    },
    {
        "itemCode": "010303011001",
        "itemName": "پلی استر 300/96 نخودی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/96 نخودی",
        "inflowQty": 18.02,
        "outflowQty": 0,
        "stockQty": 18.02,
        "cartonsQty": 0
    },
    {
        "itemCode": "010303021001",
        "itemName": "پلی استر 300 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 سفید",
        "inflowQty": 223783.1,
        "outflowQty": 196067.56,
        "stockQty": 27715.54,
        "cartonsQty": 0
    },
    {
        "itemCode": "010303031001",
        "itemName": "پلی استر 300/48 مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/48 مشکی",
        "inflowQty": 13347.33,
        "outflowQty": 13216.919,
        "stockQty": 130.411,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103030601",
        "itemName": "پلی استر 300/96 کرم خاکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/96 کرم خاکی",
        "inflowQty": 1568.28,
        "outflowQty": 254.34,
        "stockQty": 1313.94,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103041001",
        "itemName": "پلی استر 75 سفید نانو",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 75 سفید نانو",
        "inflowQty": 51.397,
        "outflowQty": 0,
        "stockQty": 51.397,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103051001",
        "itemName": "پلی استر 150 دودی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 دودی",
        "inflowQty": 10769.91,
        "outflowQty": 10493.57,
        "stockQty": 276.34,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103080101",
        "itemName": "dty یا پلی استر - کد 080101",
        "groupName": "dty یا پلی استر",
        "subGroupName": "",
        "inflowQty": 50.01,
        "outflowQty": 0,
        "stockQty": 50.01,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103080102",
        "itemName": "پلی استر 600 مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 600 مینگل سفید",
        "inflowQty": 13.6,
        "outflowQty": 0,
        "stockQty": 13.6,
        "cartonsQty": 0
    },
    {
        "itemCode": "010308021001",
        "itemName": "پلی استر 600 کو مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 600 کو مینگل سفید",
        "inflowQty": 36245.011,
        "outflowQty": 35673.572,
        "stockQty": 571.439,
        "cartonsQty": 0
    },
    {
        "itemCode": "01030803100110011001",
        "itemName": "پلی استر 600 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 600 سفید",
        "inflowQty": 15.02,
        "outflowQty": 0,
        "stockQty": 15.02,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103090101",
        "itemName": "پلی استر 200 مینگل خاکستری",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 مینگل خاکستری",
        "inflowQty": 86.84,
        "outflowQty": 0,
        "stockQty": 86.84,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103090102",
        "itemName": "پلی استر 200 مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 مینگل سفید",
        "inflowQty": 1250.68,
        "outflowQty": 1115.02,
        "stockQty": 135.66,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103090103",
        "itemName": "پلی استر 200 مینگل مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 مینگل مشکی",
        "inflowQty": 57.78,
        "outflowQty": 0,
        "stockQty": 57.78,
        "cartonsQty": 0
    },
    {
        "itemCode": "010309021001",
        "itemName": "پلی استر 300 مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 مینگل سفید",
        "inflowQty": 1845.5,
        "outflowQty": 610.88,
        "stockQty": 1234.62,
        "cartonsQty": 0
    },
    {
        "itemCode": "010309041001",
        "itemName": "پلی استر 150 مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 150 مینگل سفید",
        "inflowQty": 35.74,
        "outflowQty": 0,
        "stockQty": 35.74,
        "cartonsQty": 0
    },
    {
        "itemCode": "0103110101",
        "itemName": "پلی استر 200 سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 سفید",
        "inflowQty": 15472.74,
        "outflowQty": 13382.194,
        "stockQty": 2090.546,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031210011001",
        "itemName": "پلی استر 120سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 120سفید",
        "inflowQty": 110439.5,
        "outflowQty": 107903.874,
        "stockQty": 2535.626,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031210011002",
        "itemName": "پلی استر 120سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 120سفید",
        "inflowQty": 681.02,
        "outflowQty": 0,
        "stockQty": 681.02,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031210021001",
        "itemName": "پلی استر 120مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 120مشکی",
        "inflowQty": 132772.71,
        "outflowQty": 127721.557,
        "stockQty": 5051.153,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031410011001",
        "itemName": "پلی استر 130سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 130سفید",
        "inflowQty": 1011.4,
        "outflowQty": 0,
        "stockQty": 1011.4,
        "cartonsQty": 0
    },
    {
        "itemCode": "01031510011001",
        "itemName": "پلی استر 300 کو مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 کو مینگل سفید",
        "inflowQty": 23883.61,
        "outflowQty": 24794.81,
        "stockQty": -911.2,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100110021001",
        "itemName": "پلی استر 300/48 کو مینگل خاکستری پفکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300/48 کو مینگل خاکستری پفکی",
        "inflowQty": 40613.75,
        "outflowQty": 40890.788,
        "stockQty": -277.038,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100110031001",
        "itemName": "پلی استر 300 کو مینگل مشکی",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 کو مینگل مشکی",
        "inflowQty": 67.84,
        "outflowQty": 0,
        "stockQty": 67.84,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100110041001",
        "itemName": "پلی استر 300 کو مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 300 کو مینگل سفید",
        "inflowQty": 2954.68,
        "outflowQty": 2092.96,
        "stockQty": 861.72,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100210011001",
        "itemName": "پلی استر 200 کو مینگل خاکستری",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 کو مینگل خاکستری",
        "inflowQty": 2179.72,
        "outflowQty": 1997,
        "stockQty": 182.72,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100210011002",
        "itemName": "پلی استر 200 کو مینگل خاکستری",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 کو مینگل خاکستری",
        "inflowQty": 6295.12,
        "outflowQty": 5848.28,
        "stockQty": 446.84,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100210021001",
        "itemName": "پلی استر 200 کو مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 کو مینگل سفید",
        "inflowQty": 9443.39,
        "outflowQty": 8213.72,
        "stockQty": 1229.67,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100210021002",
        "itemName": "پلی استر 200 کو مینگل سفید",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 200 کو مینگل سفید",
        "inflowQty": 19191.4,
        "outflowQty": 19102.59,
        "stockQty": 88.81,
        "cartonsQty": 0
    },
    {
        "itemCode": "010315100310011001",
        "itemName": "پلی استر 600 کو مینگل خاکستری",
        "groupName": "dty یا پلی استر",
        "subGroupName": "پلی استر 600 کو مینگل خاکستری",
        "inflowQty": 66.5,
        "outflowQty": 0,
        "stockQty": 66.5,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104011001",
        "itemName": "لاستیک - کد 011001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 15841,
        "outflowQty": 9804.324,
        "stockQty": 6036.676,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104011002",
        "itemName": "لاستیک - کد 011002",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 19721,
        "outflowQty": 7073.595,
        "stockQty": 12647.405,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104021001",
        "itemName": "لاستیک - کد 021001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 40,
        "outflowQty": 0,
        "stockQty": 40,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104021002",
        "itemName": "لاستیک - کد 021002",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 400,
        "outflowQty": 0,
        "stockQty": 400,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104031001",
        "itemName": "لاستیک - کد 031001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 6545.26,
        "outflowQty": 5401.916,
        "stockQty": 1143.344,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104041001",
        "itemName": "لاستیک - کد 041001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 8580,
        "outflowQty": 4360,
        "stockQty": 4220,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104051001",
        "itemName": "لاستیک - کد 051001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 13140,
        "outflowQty": 18063.398,
        "stockQty": -4923.398,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104051002",
        "itemName": "لاستیک - کد 051002",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 320,
        "outflowQty": 320,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104061002",
        "itemName": "لاستیک - کد 061002",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 440,
        "outflowQty": 0,
        "stockQty": 440,
        "cartonsQty": 0
    },
    {
        "itemCode": "0104071001",
        "itemName": "لاستیک - کد 071001",
        "groupName": "لاستیک",
        "subGroupName": "",
        "inflowQty": 140,
        "outflowQty": 20,
        "stockQty": 120,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051001",
        "itemName": "لاکرا - کد 1001",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 681.493,
        "outflowQty": 756.732,
        "stockQty": -75.239,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051002",
        "itemName": "لاکرا - کد 1002",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 2343,
        "outflowQty": 2574.464,
        "stockQty": -231.464,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051003",
        "itemName": "لاکرا - کد 1003",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 7623.6,
        "outflowQty": 15172.692,
        "stockQty": -7549.092,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051004",
        "itemName": "لاکرا - کد 1004",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 8.62,
        "outflowQty": 0,
        "stockQty": 8.62,
        "cartonsQty": 0
    },
    {
        "itemCode": "01051005",
        "itemName": "لاکرا - کد 1005",
        "groupName": "لاکرا",
        "subGroupName": "",
        "inflowQty": 67.825,
        "outflowQty": 0,
        "stockQty": 67.825,
        "cartonsQty": 0
    },
    {
        "itemCode": "010601",
        "itemName": "پلی استر اسپان - کد 01",
        "groupName": "پلی استر اسپان",
        "subGroupName": "",
        "inflowQty": 182507.52,
        "outflowQty": 14809.6,
        "stockQty": 167697.92,
        "cartonsQty": 0
    },
    {
        "itemCode": "01071001001",
        "itemName": "مستر بچ - کد 1001001",
        "groupName": "مستر بچ",
        "subGroupName": "",
        "inflowQty": 7459.149,
        "outflowQty": 5587.879,
        "stockQty": 1871.27,
        "cartonsQty": 0
    },
    {
        "itemCode": "0108100110011001",
        "itemName": "نایلون - کد 100110011001",
        "groupName": "نایلون",
        "subGroupName": "",
        "inflowQty": 618.768,
        "outflowQty": 309.384,
        "stockQty": 309.384,
        "cartonsQty": 0
    },
    {
        "itemCode": "0108100110011002",
        "itemName": "نایلون - کد 100110011002",
        "groupName": "نایلون",
        "subGroupName": "",
        "inflowQty": 165.74,
        "outflowQty": 166.414,
        "stockQty": -0.674,
        "cartonsQty": 0
    },
    {
        "itemCode": "0108100110011003",
        "itemName": "نایلون - کد 100110011003",
        "groupName": "نایلون",
        "subGroupName": "",
        "inflowQty": 245.02,
        "outflowQty": 243.641,
        "stockQty": 1.379,
        "cartonsQty": 0
    },
    {
        "itemCode": "0108100110011004",
        "itemName": "نایلون - کد 100110011004",
        "groupName": "نایلون",
        "subGroupName": "",
        "inflowQty": 1079.86,
        "outflowQty": 539.93,
        "stockQty": 539.93,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010101011001",
        "itemName": "اسپندکس سفید (کاور 40/75)",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس سفید (کاور 40/75)",
        "inflowQty": 708.07,
        "outflowQty": 647.68,
        "stockQty": 60.39,
        "cartonsQty": 4
    },
    {
        "itemCode": "04010101021001",
        "itemName": "اسپندکس مشکی( کاور 40/75)",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس مشکی( کاور 40/75)",
        "inflowQty": 1213.8,
        "outflowQty": 1116.23,
        "stockQty": 97.57,
        "cartonsQty": 7
    },
    {
        "itemCode": "04010101031003",
        "itemName": "اسپندکس قرمز(کاور 40/75) نانو",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس قرمز(کاور 40/75) نانو",
        "inflowQty": 278.79,
        "outflowQty": 278.79,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010101081001",
        "itemName": "اسپندکس زرد(کاور 40/75) ل 40",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس زرد(کاور 40/75) ل 40",
        "inflowQty": 118.1,
        "outflowQty": 59.05,
        "stockQty": 59.05,
        "cartonsQty": 4
    },
    {
        "itemCode": "04010101081002",
        "itemName": "اسپندکس زرد(کاور 40/75) نانو",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس زرد(کاور 40/75) نانو",
        "inflowQty": 271.24,
        "outflowQty": 138.26,
        "stockQty": 132.98,
        "cartonsQty": 9
    },
    {
        "itemCode": "04010102011001",
        "itemName": "اسپندکس (کاور 40/100) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) سفید",
        "inflowQty": 1839.97,
        "outflowQty": 690.65,
        "stockQty": 1149.32,
        "cartonsQty": 77
    },
    {
        "itemCode": "04010102011002",
        "itemName": "اسپاندکس (کاور) - کد 0102011002",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "",
        "inflowQty": 41.1,
        "outflowQty": 82.2,
        "stockQty": -41.1,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010102021001",
        "itemName": "اسپندکس (کاور 40/100) مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) مشکی",
        "inflowQty": 14912.12,
        "outflowQty": 11880.23,
        "stockQty": 3031.89,
        "cartonsQty": 202
    },
    {
        "itemCode": "040101020401",
        "itemName": "اسپندکس (کاور 40/100 ) نارنجی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100 ) نارنجی",
        "inflowQty": 189.6,
        "outflowQty": 379.2,
        "stockQty": -189.6,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101020502",
        "itemName": "اسپندکس (کاور 40/100) آبی لی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) آبی لی",
        "inflowQty": 164.32,
        "outflowQty": 237.73,
        "stockQty": -73.41,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101020601",
        "itemName": "اسپندکس (کاور 40/100) طوسی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) طوسی",
        "inflowQty": 480.27,
        "outflowQty": 69.57,
        "stockQty": 410.7,
        "cartonsQty": 27
    },
    {
        "itemCode": "040101020602",
        "itemName": "اسپندکس (کاور 40/100) طوسی تیره",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) طوسی تیره",
        "inflowQty": 20.6,
        "outflowQty": 0,
        "stockQty": 20.6,
        "cartonsQty": 1
    },
    {
        "itemCode": "040101020603",
        "itemName": "اسپندکس (کاور 40/100) طوسی مات",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) طوسی مات",
        "inflowQty": 373.59,
        "outflowQty": 0,
        "stockQty": 373.59,
        "cartonsQty": 25
    },
    {
        "itemCode": "0401010210001",
        "itemName": "اسپندکس (کاور 40/100) سرمه ای",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) سرمه ای",
        "inflowQty": 513.18,
        "outflowQty": 668.22,
        "stockQty": -155.04,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010102121001",
        "itemName": "اسپندکس (کاور 40/100) آبی فیلی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) آبی فیلی",
        "inflowQty": 86.7,
        "outflowQty": 131.18,
        "stockQty": -44.48,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010102131001",
        "itemName": "اسپندکس (کاور 40/100) یاسی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) یاسی",
        "inflowQty": 81.8,
        "outflowQty": 81.8,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010102141001",
        "itemName": "اسپندکس (کاور 40/100) صورتی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) صورتی",
        "inflowQty": 774.55,
        "outflowQty": 510.33,
        "stockQty": 264.22,
        "cartonsQty": 18
    },
    {
        "itemCode": "04010102151001",
        "itemName": "اسپندکس (کاور 40/100) قهوه ای",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/100) قهوه ای",
        "inflowQty": 19.72,
        "outflowQty": 19.72,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010103031004",
        "itemName": "اسپندکس (کاور 40/150) قرمز FSE",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/150) قرمز FSE",
        "inflowQty": 3046.75,
        "outflowQty": 3132.14,
        "stockQty": -85.39,
        "cartonsQty": 0
    },
    {
        "itemCode": "040101030401",
        "itemName": "اسپندکس (کاور 40/150) نخودی FSE",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/150) نخودی FSE",
        "inflowQty": 2345.36,
        "outflowQty": 1786.58,
        "stockQty": 558.78,
        "cartonsQty": 37
    },
    {
        "itemCode": "04010103051002",
        "itemName": "اسپندکس طوسی (کاور 40/150)",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس طوسی (کاور 40/150)",
        "inflowQty": 61.5,
        "outflowQty": 0,
        "stockQty": 61.5,
        "cartonsQty": 4
    },
    {
        "itemCode": "04010103061001",
        "itemName": "اسپندکس قهوه ای (کاور 40/150)",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس قهوه ای (کاور 40/150)",
        "inflowQty": 38.48,
        "outflowQty": 0,
        "stockQty": 38.48,
        "cartonsQty": 3
    },
    {
        "itemCode": "04010103071001",
        "itemName": "اسپندکس (کاور 40/150) آبی شالی FSE",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/150) آبی شالی FSE",
        "inflowQty": 2808.55,
        "outflowQty": 1666.74,
        "stockQty": 1141.81,
        "cartonsQty": 76
    },
    {
        "itemCode": "0401010610011001",
        "itemName": "اسپندکس (کاور 40/120) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/120) سفید",
        "inflowQty": 48376.97,
        "outflowQty": 38023.52,
        "stockQty": 10353.45,
        "cartonsQty": 690
    },
    {
        "itemCode": "0401010610011002",
        "itemName": "اسپندکس (کاور 40/120) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/120) سفید",
        "inflowQty": 3488.51,
        "outflowQty": 2170.5,
        "stockQty": 1318.01,
        "cartonsQty": 88
    },
    {
        "itemCode": "0401010610021001",
        "itemName": "اسپندکس (کاور 40/120) مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 40/120) مشکی",
        "inflowQty": 32577.67,
        "outflowQty": 21771.85,
        "stockQty": 10805.82,
        "cartonsQty": 720
    },
    {
        "itemCode": "04010202011001",
        "itemName": "اسپندکس (کاور 30/100) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/100) سفید",
        "inflowQty": 8967.205,
        "outflowQty": 6563.34,
        "stockQty": 2403.865,
        "cartonsQty": 160
    },
    {
        "itemCode": "04010202021001",
        "itemName": "اسپندکس (کاور 30/100) مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/100) مشکی",
        "inflowQty": 12292.25,
        "outflowQty": 12439.9,
        "stockQty": -147.65,
        "cartonsQty": 0
    },
    {
        "itemCode": "04010203031001",
        "itemName": "اسپندکس (کاور 30/150) قرمز FSC",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/150) قرمز FSC",
        "inflowQty": 3584.2,
        "outflowQty": 3238.26,
        "stockQty": 345.94,
        "cartonsQty": 23
    },
    {
        "itemCode": "04010203041001",
        "itemName": "اسپندکس (کاور 30/150) طوسی تیره FSC",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/150) طوسی تیره FSC",
        "inflowQty": 1695.34,
        "outflowQty": 1695.34,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0401020410011001",
        "itemName": "اسپندکس (کاور 30/120) سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/120) سفید",
        "inflowQty": 17741.18,
        "outflowQty": 9080.24,
        "stockQty": 8660.94,
        "cartonsQty": 577
    },
    {
        "itemCode": "0401020410021001",
        "itemName": "اسپندکس (کاور 30/120) مشکی",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپندکس (کاور 30/120) مشکی",
        "inflowQty": 31632.9,
        "outflowQty": 23577.42,
        "stockQty": 8055.48,
        "cartonsQty": 537
    },
    {
        "itemCode": "040103011001",
        "itemName": "اسپاندکس 20/100 سفید hb",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپاندکس 20/100 سفید hb",
        "inflowQty": 4751.64,
        "outflowQty": 937.74,
        "stockQty": 3813.9,
        "cartonsQty": 254
    },
    {
        "itemCode": "040103011004",
        "itemName": "اسپاندکس 20/75 سفید",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپاندکس 20/75 سفید",
        "inflowQty": 22.19,
        "outflowQty": 0,
        "stockQty": 22.19,
        "cartonsQty": 1
    },
    {
        "itemCode": "040103021001",
        "itemName": "اسپاندکس 20/100 مشکی hb",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپاندکس 20/100 مشکی hb",
        "inflowQty": 1708.55,
        "outflowQty": 1669.31,
        "stockQty": 39.24,
        "cartonsQty": 3
    },
    {
        "itemCode": "0401030210051001",
        "itemName": "اسپاندکس 20/120 مشکیHTB",
        "groupName": "اسپاندکس (کاور)",
        "subGroupName": "اسپاندکس 20/120 مشکیHTB",
        "inflowQty": 4522.81,
        "outflowQty": 2931.63,
        "stockQty": 1591.18,
        "cartonsQty": 106
    },
    {
        "itemCode": "0402010101",
        "itemName": "کش 110 سفید بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 110 سفید بشقابی",
        "inflowQty": 5131.36,
        "outflowQty": 3282.69,
        "stockQty": 1848.67,
        "cartonsQty": 116
    },
    {
        "itemCode": "0402010105",
        "itemName": "کش 110S سفید بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 110S سفید بشقابی",
        "inflowQty": 64176.931,
        "outflowQty": 53702.221,
        "stockQty": 10474.71,
        "cartonsQty": 655
    },
    {
        "itemCode": "04020101061002",
        "itemName": "کش 110 سفید استوانه",
        "groupName": "کش",
        "subGroupName": "کش 110 سفید استوانه",
        "inflowQty": 18.4,
        "outflowQty": 0,
        "stockQty": 18.4,
        "cartonsQty": 1
    },
    {
        "itemCode": "04020101081002",
        "itemName": "کش 110S سفید استوانه",
        "groupName": "کش",
        "subGroupName": "کش 110S سفید استوانه",
        "inflowQty": 8134.43,
        "outflowQty": 3341.56,
        "stockQty": 4792.87,
        "cartonsQty": 300
    },
    {
        "itemCode": "04020101081003",
        "itemName": "کش 110S سفید مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 110S سفید مخروطی",
        "inflowQty": 267.36,
        "outflowQty": 267.36,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0402010201",
        "itemName": "کش 110 مشکی",
        "groupName": "کش",
        "subGroupName": "کش 110 مشکی",
        "inflowQty": 29285.76,
        "outflowQty": 24561.6,
        "stockQty": 4724.16,
        "cartonsQty": 295
    },
    {
        "itemCode": "0402010205",
        "itemName": "کش 110S مشکی",
        "groupName": "کش",
        "subGroupName": "کش 110S مشکی",
        "inflowQty": 28711.82,
        "outflowQty": 26804.07,
        "stockQty": 1907.75,
        "cartonsQty": 119
    },
    {
        "itemCode": "040201020602",
        "itemName": "کش 110 مشکی مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 110 مشکی مخروطی",
        "inflowQty": 39.94,
        "outflowQty": 9.52,
        "stockQty": 30.42,
        "cartonsQty": 2
    },
    {
        "itemCode": "0402010402",
        "itemName": "کش 110 طوسی",
        "groupName": "کش",
        "subGroupName": "کش 110 طوسی",
        "inflowQty": 2429.74,
        "outflowQty": 2099.09,
        "stockQty": 330.65,
        "cartonsQty": 21
    },
    {
        "itemCode": "04020210111001",
        "itemName": "کش 90 مشکی بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 90 مشکی بشقابی",
        "inflowQty": 376,
        "outflowQty": 205.74,
        "stockQty": 170.26,
        "cartonsQty": 11
    },
    {
        "itemCode": "04020210111002",
        "itemName": "کش 90F مشکی بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 90F مشکی بشقابی",
        "inflowQty": 53293.69,
        "outflowQty": 37146.12,
        "stockQty": 16147.57,
        "cartonsQty": 1009
    },
    {
        "itemCode": "040202101110031003",
        "itemName": "کش 90F مشکی مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 90F مشکی مخروطی",
        "inflowQty": 16850.83,
        "outflowQty": 7391.48,
        "stockQty": 9459.35,
        "cartonsQty": 591
    },
    {
        "itemCode": "040202101110041002",
        "itemName": "کش 90 مشکی بشقابی",
        "groupName": "کش",
        "subGroupName": "کش 90 مشکی بشقابی",
        "inflowQty": 4.14,
        "outflowQty": 2.76,
        "stockQty": 1.38,
        "cartonsQty": 0
    },
    {
        "itemCode": "040202101110041003",
        "itemName": "کش 90 مشکی مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 90 مشکی مخروطی",
        "inflowQty": 55.92,
        "outflowQty": 29.13,
        "stockQty": 26.79,
        "cartonsQty": 2
    },
    {
        "itemCode": "04020210121001",
        "itemName": "کش 90 سفید",
        "groupName": "کش",
        "subGroupName": "کش 90 سفید",
        "inflowQty": 76.08,
        "outflowQty": 38.12,
        "stockQty": 37.96,
        "cartonsQty": 2
    },
    {
        "itemCode": "04020210121002",
        "itemName": "کش 90F سفید",
        "groupName": "کش",
        "subGroupName": "کش 90F سفید",
        "inflowQty": 16251.6,
        "outflowQty": 10966.86,
        "stockQty": 5284.74,
        "cartonsQty": 330
    },
    {
        "itemCode": "04020210121003",
        "itemName": "کش 90F سفید مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 90F سفید مخروطی",
        "inflowQty": 2573.83,
        "outflowQty": 1060.74,
        "stockQty": 1513.09,
        "cartonsQty": 95
    },
    {
        "itemCode": "0402041001",
        "itemName": "کش 40 سفید",
        "groupName": "کش",
        "subGroupName": "کش 40 سفید",
        "inflowQty": 17.96,
        "outflowQty": 0,
        "stockQty": 17.96,
        "cartonsQty": 1
    },
    {
        "itemCode": "0402041003",
        "itemName": "کش 40T سفید",
        "groupName": "کش",
        "subGroupName": "کش 40T سفید",
        "inflowQty": 4958.54,
        "outflowQty": 4726.62,
        "stockQty": 231.92,
        "cartonsQty": 14
    },
    {
        "itemCode": "0402041006",
        "itemName": "کش 40L مشکی",
        "groupName": "کش",
        "subGroupName": "کش 40L مشکی",
        "inflowQty": 5.48,
        "outflowQty": 0,
        "stockQty": 5.48,
        "cartonsQty": 0
    },
    {
        "itemCode": "0402041008",
        "itemName": "کش 40  LN قرمز مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 40  LN قرمز مخروطی",
        "inflowQty": 19.67,
        "outflowQty": 0,
        "stockQty": 19.67,
        "cartonsQty": 1
    },
    {
        "itemCode": "04020410111008",
        "itemName": "کش 40  LN سفید مخروطی (کارمزدی روح بخش)",
        "groupName": "کش",
        "subGroupName": "کش 40  LN سفید مخروطی (کارمزدی روح بخش)",
        "inflowQty": 113.08,
        "outflowQty": 113.08,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "0402041012",
        "itemName": "کش 40T سفید مخروطی",
        "groupName": "کش",
        "subGroupName": "کش 40T سفید مخروطی",
        "inflowQty": 8270.46,
        "outflowQty": 7342.61,
        "stockQty": 927.85,
        "cartonsQty": 58
    },
    {
        "itemCode": "04020601",
        "itemName": "کش - کد 0601",
        "groupName": "کش",
        "subGroupName": "",
        "inflowQty": 67.95,
        "outflowQty": 0,
        "stockQty": 67.95,
        "cartonsQty": 4
    },
    {
        "itemCode": "04020602",
        "itemName": "کش - کد 0602",
        "groupName": "کش",
        "subGroupName": "",
        "inflowQty": 9.7,
        "outflowQty": 0,
        "stockQty": 9.7,
        "cartonsQty": 1
    },
    {
        "itemCode": "04020701",
        "itemName": "شوایتر کش رنگی",
        "groupName": "کش",
        "subGroupName": "شوایتر کش رنگی",
        "inflowQty": 84.6,
        "outflowQty": 0,
        "stockQty": 84.6,
        "cartonsQty": 5
    },
    {
        "itemCode": "040301020101",
        "itemName": "ساپورت 40/100 HF سفید",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "ساپورت 40/100 HF سفید",
        "inflowQty": 22645.461,
        "outflowQty": 14598.375,
        "stockQty": 8047.086,
        "cartonsQty": 473
    },
    {
        "itemCode": "040301020102",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 01020102",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 4443.46,
        "outflowQty": 4195.42,
        "stockQty": 248.04,
        "cartonsQty": 15
    },
    {
        "itemCode": "040301020103",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 01020103",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 3977.08,
        "outflowQty": 0,
        "stockQty": 3977.08,
        "cartonsQty": 234
    },
    {
        "itemCode": "040301020104",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 01020104",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 34.62,
        "outflowQty": 0,
        "stockQty": 34.62,
        "cartonsQty": 2
    },
    {
        "itemCode": "040301020201",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 01020201",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 2018.694,
        "outflowQty": 2092.574,
        "stockQty": -73.88,
        "cartonsQty": 0
    },
    {
        "itemCode": "0403010301001",
        "itemName": "ساپورت 40/150 FSE سفید",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "ساپورت 40/150 FSE سفید",
        "inflowQty": 3700.126,
        "outflowQty": 1816.129,
        "stockQty": 1883.997,
        "cartonsQty": 111
    },
    {
        "itemCode": "040301030201",
        "itemName": "ساپورت 40/150 FSE مشکی",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "ساپورت 40/150 FSE مشکی",
        "inflowQty": 2718.65,
        "outflowQty": 1604.306,
        "stockQty": 1114.344,
        "cartonsQty": 66
    },
    {
        "itemCode": "040303020101",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 03020101",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 603.46,
        "outflowQty": 419.44,
        "stockQty": 184.02,
        "cartonsQty": 11
    },
    {
        "itemCode": "04030302021001",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 0302021001",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 5452.79,
        "outflowQty": 3069.26,
        "stockQty": 2383.53,
        "cartonsQty": 140
    },
    {
        "itemCode": "040303030101",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 03030101",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 1429.69,
        "outflowQty": 1282.17,
        "stockQty": 147.52,
        "cartonsQty": 9
    },
    {
        "itemCode": "040303030201",
        "itemName": "اسپاندکس جوشی ( ساپورت ) - کد 03030201",
        "groupName": "اسپاندکس جوشی ( ساپورت )",
        "subGroupName": "",
        "inflowQty": 2719.77,
        "outflowQty": 2883.46,
        "stockQty": -163.69,
        "cartonsQty": 0
    },
    {
        "itemCode": "040501011001",
        "itemName": "پلی استر شوایتر 150 سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 سفید",
        "inflowQty": 60375.92,
        "outflowQty": 57482.91,
        "stockQty": 2893.01,
        "cartonsQty": 187
    },
    {
        "itemCode": "040501021001",
        "itemName": "پلی استر شوایتر 150 مشکی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 مشکی",
        "inflowQty": 6539.63,
        "outflowQty": 5908.31,
        "stockQty": 631.32,
        "cartonsQty": 41
    },
    {
        "itemCode": "0405010801",
        "itemName": "پلی استر شوایتر 150 کرم",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 کرم",
        "inflowQty": 2245.26,
        "outflowQty": 2083.38,
        "stockQty": 161.88,
        "cartonsQty": 10
    },
    {
        "itemCode": "040501131001",
        "itemName": "پلی استر شوایتر 150 نخودی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 نخودی",
        "inflowQty": 1299,
        "outflowQty": 1121.54,
        "stockQty": 177.46,
        "cartonsQty": 11
    },
    {
        "itemCode": "040501171001",
        "itemName": "پلی استر شوایتر 150 دودی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 دودی",
        "inflowQty": 114.76,
        "outflowQty": 134.16,
        "stockQty": -19.4,
        "cartonsQty": 0
    },
    {
        "itemCode": "040501181001",
        "itemName": "پلی استر شوایتر 150 طوسی تیره",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 طوسی تیره",
        "inflowQty": 32.64,
        "outflowQty": 32.64,
        "stockQty": 0,
        "cartonsQty": 0
    },
    {
        "itemCode": "040502011001",
        "itemName": "پلی استر شوایتر 300 سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 300 سفید",
        "inflowQty": 3822.38,
        "outflowQty": 2601.77,
        "stockQty": 1220.61,
        "cartonsQty": 79
    },
    {
        "itemCode": "040502021001",
        "itemName": "پلی استر شوایتر 300 مشکی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 300 مشکی",
        "inflowQty": 95.92,
        "outflowQty": 41.08,
        "stockQty": 54.84,
        "cartonsQty": 4
    },
    {
        "itemCode": "0405031002",
        "itemName": "پلی استر شوایتر 100سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 100سفید",
        "inflowQty": 27.16,
        "outflowQty": 0,
        "stockQty": 27.16,
        "cartonsQty": 2
    },
    {
        "itemCode": "0405031005",
        "itemName": "پلی استر شوایتر - کد 031005",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "",
        "inflowQty": 610.34,
        "outflowQty": 0,
        "stockQty": 610.34,
        "cartonsQty": 39
    },
    {
        "itemCode": "0405041001",
        "itemName": "پلی استر شوایتر 100سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 100سفید",
        "inflowQty": 2719.18,
        "outflowQty": 1259.66,
        "stockQty": 1459.52,
        "cartonsQty": 94
    },
    {
        "itemCode": "0405041002",
        "itemName": "پلی استر شوایتر 100مشکی",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 100مشکی",
        "inflowQty": 1214.18,
        "outflowQty": 660.06,
        "stockQty": 554.12,
        "cartonsQty": 36
    },
    {
        "itemCode": "0405051001",
        "itemName": "پلی استر شوایتر 150 سفید",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 150 سفید",
        "inflowQty": 1918.99,
        "outflowQty": 0,
        "stockQty": 1918.99,
        "cartonsQty": 124
    },
    {
        "itemCode": "0405071001",
        "itemName": "پلی استر شوایتر رنگارنگ",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر رنگارنگ",
        "inflowQty": 41.3,
        "outflowQty": 0,
        "stockQty": 41.3,
        "cartonsQty": 3
    },
    {
        "itemCode": "04050910021001",
        "itemName": "پلی استر شوایتر 300 خاکستری کو مینگل",
        "groupName": "پلی استر شوایتر",
        "subGroupName": "پلی استر شوایتر 300 خاکستری کو مینگل",
        "inflowQty": 1604.12,
        "outflowQty": 1320.9,
        "stockQty": 283.22,
        "cartonsQty": 18
    },
    {
        "itemCode": "04101001",
        "itemName": "FDY - کد 1001",
        "groupName": "FDY",
        "subGroupName": "",
        "inflowQty": 18314.56,
        "outflowQty": 9928,
        "stockQty": 8386.56,
        "cartonsQty": 419
    }
];
    return { lastYearStock, currentStock };
}
