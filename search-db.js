import fs from 'fs';
const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));

// Find any object or array that contains 2050230444
function deepSearch(obj, targetValue, path = '') {
    if (obj === null || obj === undefined) return;
    
    if (typeof obj === 'number' || typeof obj === 'string') {
        if (obj.toString() === targetValue.toString()) {
            console.log(`Found value ${targetValue} at path: ${path}`);
        }
        return;
    }
    
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            deepSearch(obj[i], targetValue, `${path}[${i}]`);
        }
        return;
    }
    
    if (typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
            deepSearch(value, targetValue, `${path}.${key}`);
        }
        return;
    }
}

console.log("Searching trade records...");
db.tradeRecords.forEach((trade, index) => {
    deepSearch(trade, '2050230444', `tradeRecords[${index}]`);
});
console.log("Done.");
