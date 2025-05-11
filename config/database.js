const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const password = encodeURIComponent('ram@20042004');
        const uri = `mongodb+srv://abhishekrajput:${password}@cluster0.ge5g18o.mongodb.net/voting_system`;
        const conn = await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB; 