const mongoose = require('mongoose');
const User = require('./models/User');

// MongoDB connection string - update this with your actual connection string
const MONGODB_URI = 'mongodb://127.0.0.1:27017/online-voting-system';

// Connect to MongoDB with better error handling
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000 // Timeout after 5s instead of 30s
})
    .then(() => {
        console.log('Connected to MongoDB');
        return deleteAllUsers();
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

async function deleteAllUsers() {
    try {
        // Delete all users except admin
        const result = await User.deleteMany({
            email: { $ne: 'abhishekrajput20252025@gmail.com' } // Keep admin user
        });

        console.log(`Successfully deleted ${result.deletedCount} users`);

        // Close the database connection
        await mongoose.connection.close();
        console.log('Database connection closed');
        process.exit(0);
    } catch (error) {
        console.error('Error deleting users:', error);
        process.exit(1);
    }
} 