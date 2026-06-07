require('dotenv').config();
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dibp_global';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ Подключено');
        
        const result = await mongoose.connection.db.collection('projects').updateMany(
            { phase: { $exists: false } },
            { $set: { phase: 1 } }
        );
        
        console.log('📊 Обновлено проектов:', result.modifiedCount);
        await mongoose.disconnect();
        console.log('✅ Готово!');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Ошибка:', err.message);
        process.exit(1);
    });
	require('dotenv').config();
var mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/dibp_global').then(async function() {
    var result = await mongoose.connection.db.collection('projects').updateOne(
        { status: 'funded', phase: 1 },
        { $set: { phase: 2, phaseUpdatedAt: new Date() } }
    );
    console.log('Исправлено:', result.modifiedCount);
    process.exit();
});