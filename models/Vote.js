const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
    election: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election',
        required: true
    },
    voter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    candidate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate',
        required: true
    },
    votedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create a compound index to ensure one vote per user per election
voteSchema.index({ election: 1, voter: 1 }, { unique: true });

// Pre-save hook to check for existing votes
voteSchema.pre('save', async function (next) {
    try {
        // Check if this is a new vote
        if (this.isNew) {
            const existingVote = await this.constructor.findOne({
                election: this.election,
                voter: this.voter
            });

            if (existingVote) {
                next(new Error('User has already voted in this election'));
            }
        }
        next();
    } catch (error) {
        next(error);
    }
});

// Static method to check if user has voted
voteSchema.statics.hasUserVoted = async function (userId, electionId) {
    const vote = await this.findOne({
        election: electionId,
        voter: userId
    });
    return !!vote;
};

const Vote = mongoose.model('Vote', voteSchema);

module.exports = Vote; 