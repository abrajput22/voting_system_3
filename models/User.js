const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: function () {
            return !this.googleId; // Password required only if not using Google auth
        }
    },
    role: {
        type: String,
        enum: ['admin', 'voter'],
        default: 'voter'
    },
    voterId: {
        type: String,
        unique: true,
        sparse: true // Allows null values but ensures uniqueness for non-null values
    },
    googleId: {
        type: String,
        sparse: true
    },
    hasPassword: {
        type: Boolean,
        default: false
    },
    tokenVersion: {
        type: Number,
        default: 0
    },
    accessToken: {
        type: String
    },
    refreshToken: {
        type: String
    },
    votedElections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election'
    }]
}, {
    timestamps: true
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Method to increment token version (for logout)
userSchema.methods.incrementTokenVersion = async function () {
    this.tokenVersion += 1;
    return this.save();
};

// Static method to generate voter ID
userSchema.statics.generateVoterId = async function () {
    const prefix = 'VOT';
    let voterId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        voterId = `${prefix}${randomNum}`;

        const existingUser = await this.findOne({ voterId });
        if (!existingUser) {
            isUnique = true;
        }
        attempts++;
    }

    if (!isUnique) {
        throw new Error('Failed to generate unique voter ID');
    }

    return voterId;
};

// Static method to initialize admin user
userSchema.statics.initializeAdmin = async function () {
    try {
        const adminEmail = 'abhishekrajput20252025@gmail.com';
        const adminPassword = 'ram@20042004';

        let admin = await this.findOne({ email: adminEmail });

        if (!admin) {
            admin = new this({
                name: 'Admin User',
                email: adminEmail,
                password: adminPassword,
                role: 'admin',
                hasPassword: true
            });
            await admin.save();
            console.log('Admin user created successfully');
        } else {
            console.log('Admin user already exists');
        }
    } catch (error) {
        console.error('Error initializing admin:', error);
    }
};

// Method to check if user is admin
userSchema.methods.isAdmin = function () {
    return this.role === 'admin';
};

const User = mongoose.model('User', userSchema);

module.exports = User; 