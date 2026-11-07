const fs = require('fs');
const filePath = '/app/applet/server.js';
let code = fs.readFileSync(filePath, 'utf8');

const oldSubmitEndpoint = /app\.post\('\/api\/public\/survey\/submit', \(req, res\) => \{[\s\S]*?\}\);/g;

const newSubmitEndpoint = `app.post('/api/public/survey/submit', (req, res) => {
    try {
        const db = getDb();
        const {
            permitNumber,
            customerName,
            customerPhone,
            qualityRating,
            deliveryRating,
            courtesyRating,
            supportRating,
            overallRating,
            whyBuyFromUs,
            wouldRecommend,
            positivePoints,
            comment
        } = req.body;

        if (!db.customerFeedbacks) db.customerFeedbacks = [];

        const feedback = {
            id: 'fb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            permitNumber: String(permitNumber || 'نامشخص'),
            customerName: String(customerName || 'مشتری محترم'),
            customerPhone: String(customerPhone || ''),
            qualityRating: Number(qualityRating) || 5,
            deliveryRating: Number(deliveryRating) || 5,
            courtesyRating: Number(courtesyRating) || 5,
            supportRating: Number(supportRating) || 5,
            overallRating: Number(overallRating) || 5,
            whyBuyFromUs: String(whyBuyFromUs || ''),
            wouldRecommend: String(wouldRecommend || ''),
            positivePoints: Array.isArray(positivePoints) ? positivePoints : [],
            comment: String(comment || '').trim(),
            submittedAt: new Date().toISOString()
        };

        db.customerFeedbacks.unshift(feedback);
        saveDb(db);

        console.log(\`[Customer Survey] New detailed feedback submitted for Permit #\${feedback.permitNumber} by \${feedback.customerName}\`);
        return res.json({ success: true, message: 'نظرسنجی شما با موفقیت ثبت شد.' });
    } catch (err) {
        console.error("Public survey submit error:", err);
        return res.status(500).json({ error: 'خطا در ثبت نظرسنجی' });
    }
});`;

code = code.replace(oldSubmitEndpoint, newSubmitEndpoint);
fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated survey submit endpoint in server.js');
