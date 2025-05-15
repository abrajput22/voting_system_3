const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    election: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election',
        required: true
    },
    votes: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Create a compound index to ensure unique candidate names within an election
candidateSchema.index({ name: 1, election: 1 }, { unique: true });

const Candidate = mongoose.model('Candidate', candidateSchema);

module.exports = Candidate; 