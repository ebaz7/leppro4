const fs = require('fs');
const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const trade = db.tradeRecords.find(t => t.fileNumber === 'LCH2504');
console.log("Found trade?", !!trade);
if (trade) {
    console.log("Trade stages agent fees:", JSON.stringify(trade.stages['agent_fees'], null, 2));
    console.log("Trade agentData:", JSON.stringify(trade.agentData, null, 2));
    console.log("Trade clearanceAgentPayments:", JSON.stringify(trade.clearanceAgentPayments, null, 2));
    console.log("Trade agentFees:", JSON.stringify(trade.agentFees, null, 2));
    console.log("Trade agentPayments:", JSON.stringify(trade.agentPayments, null, 2));
}
