const Election = require('../models/Election');
const Candidate = require('../models/Candidate');
const User = require('../models/User');

exports.createElection = async (req, res) => {
    try {
        const { title, description, startDate, endDate, candidates } = req.body;

        // Validate required fields
        if (!title || !description || !startDate || !endDate || !candidates) {
            throw new Error('All fields are required');
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start >= end) {
            throw new Error('End date must be after start date');
        }

        // Create candidates first
        const candidatePromises = candidates.map(async (candidate) => {
            const newCandidate = new Candidate({
                name: candidate.name,
                description: candidate.description
            });
            return await newCandidate.save();
        });

        const savedCandidates = await Promise.all(candidatePromises);

        // Create election with candidate references
        const election = new Election({
            title,
            description,
            startDate: start,
            endDate: end,
            status: 'upcoming',
            candidates: savedCandidates.map(c => c._id)
        });

        await election.save();

        res.redirect('/admin');
    } catch (error) {
        console.error('Election creation error:', error);
        res.redirect('/admin/create?error=' + encodeURIComponent(error.message));
    }
};

exports.castVote = async (req, res) => {
    try {
        const { electionId, candidateId } = req.body;
        const userId = req.session.user.id;

        // Validate election exists and is active
        const election = await Election.findById(electionId);
        if (!election) {
            throw new Error('Election not found');
        }
        if (election.status !== 'active') {
            throw new Error('This election is not active');
        }

        // Check if user has already voted
        const user = await User.findById(userId);
        if (user.votedElections.includes(electionId)) {
            throw new Error('You have already voted in this election');
        }

        // Update candidate votes
        await Candidate.findByIdAndUpdate(candidateId, {
            $inc: { votes: 1 }
        });

        // Update user's voted elections
        await User.findByIdAndUpdate(userId, {
            $push: { votedElections: electionId }
        });

        res.redirect('/voting?success=Vote cast successfully');
    } catch (error) {
        console.error('Voting error:', error);
        res.redirect('/voting?error=' + encodeURIComponent(error.message));
    }
};

exports.getElectionResults = async (req, res) => {
    try {
        const election = await Election.findById(req.params.id)
            .populate('candidates');

        if (!election) {
            throw new Error('Election not found');
        }

        res.render('results', {
            election,
            user: req.session.user,
            error: req.query.error
        });
    } catch (error) {
        res.status(500).render('error', { error: error.message });
    }
}; 