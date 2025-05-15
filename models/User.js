const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
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
            return !this.googleId; // Password required only if not a Google user
        }
    },
    googleId: {
        type: String,
        sparse: true
    },
    hasPassword: {
        type: Boolean,
        default: true
    },
    role: {
        type: String,
        enum: ['admin', 'voter'],
        default: 'voter'
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
    }],
    voterId: {
        type: String,
        unique: true
    }
}, {
    timestamps: true
});

// Hash password before saving
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

// Create admin user if it doesn't exist
userSchema.statics.createAdminIfNotExists = async function () {
    try {
        const adminExists = await this.findOne({ email: 'abhishekrajput20252025@gmail.com' });
        if (!adminExists) {
            const admin = new this({
                name: 'Admin',
                email: 'abhishekrajput20252025@gmail.com',
                password: 'ram@20042004',
                role: 'admin'
            });
            await admin.save();
            console.log('Admin user created successfully');
        }
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
};

// Generate unique 6-digit voter ID
userSchema.statics.generateVoterId = async function () {
    let voterId;
    let isUnique = false;

    while (!isUnique) {
        // Generate 6-digit number
        voterId = Math.floor(100000 + Math.random() * 900000).toString();
        // Check if it exists
        const existingUser = await this.findOne({ voterId });
        if (!existingUser) {
            isUnique = true;
        }
    }

    return voterId;
};

const User = mongoose.model('User', userSchema);

// Create admin user on model initialization
User.createAdminIfNotExists();

module.exports = User; 