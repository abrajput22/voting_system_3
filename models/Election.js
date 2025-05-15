const mongoose = require('mongoose');

const electionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['upcoming', 'active', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    candidates: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate'
    }],
    eligibleVoters: [{
        voterId: {
            type: String,
            required: true
        },
        addedAt: {
            type: Date,
            default: Date.now
        },
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    totalVotes: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Add validation to ensure endDate is after startDate
electionSchema.pre('save', function (next) {
    if (this.endDate <= this.startDate) {
        next(new Error('End date must be after start date'));
    }
    next();
});

// Method to check if election is active
electionSchema.methods.isActive = function () {
    const now = new Date();
    return this.status === 'active' && now >= this.startDate && now <= this.endDate;
};

// Method to check if a voter is eligible
electionSchema.methods.isVoterEligible = function (voterId) {
    if (!voterId) {
        console.log('No voterId provided for eligibility check');
        return false;
    }

    console.log('Checking voter eligibility:', {
        voterId: voterId,
        electionId: this._id,
        eligibleVoters: this.eligibleVoters.map(v => v.voterId)
    });

    return this.eligibleVoters.some(voter => voter.voterId.trim() === voterId.trim());
};

// Method to add a voter to the eligible list
electionSchema.methods.addEligibleVoter = async function (voterId, adminId) {
    if (!this.isVoterEligible(voterId)) {
        this.eligibleVoters.push({
            voterId,
            addedBy: adminId
        });
        await this.save();
        return true;
    }
    return false;
};

// Method to remove a voter from the eligible list
electionSchema.methods.removeEligibleVoter = async function (voterId) {
    const initialLength = this.eligibleVoters.length;
    this.eligibleVoters = this.eligibleVoters.filter(voter => voter.voterId !== voterId);
    if (this.eligibleVoters.length !== initialLength) {
        await this.save();
        return true;
    }
    return false;
};

const Election = mongoose.model('Election', electionSchema);

module.exports = Election; 