require('dotenv').config();
var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dibp_global')
    .then(async function() {
        var projects = await mongoose.connection.db.collection('projects').find({}).toArray();
        projects.forEach(function(p) {
            console.log(p.title, '| Статус:', p.status, '| Фаза:', p.phase || 1, '| Собрано:', p.collectedAmount, '/', p.targetAmount);
        });
        await mongoose.disconnect();
        process.exit();
    });