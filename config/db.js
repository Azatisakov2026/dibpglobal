<<<<<<< HEAD
const mongoose = require('mongoose');
const connectDB = async () => {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
};
=======
const mongoose = require('mongoose');
const connectDB = async () => {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
};
>>>>>>> 502a4b1 (Full project)
module.exports = connectDB;