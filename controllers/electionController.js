const Election = require('../models/Election');
const Candidate = require('../models/Candidate');
const User = require('../models/User');
const Vote = require('../models/Vote');

exports.createElection = async (req, res) => {
    try {
        const { title, description, startDate, endDate, candidates, voterIds } = req.body;
        console.log('Creating election with data:', {
            title,
            description,
            startDate,
            endDate,
            candidates,
            voterIds
        });

        // Validate required fields
        if (!title || !description || !startDate || !endDate || !candidates || !voterIds) {
            throw new Error('All fields are required');
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start >= end) {
            throw new Error('End date must be after start date');
        }

        // Process voter IDs
        const voterIdList = voterIds.split('\n')
            .map(id => id.trim())
            .filter(id => id.length > 0);

        // Validate that all voter IDs exist
        const voters = await User.find({ voterId: { $in: voterIdList } });
        if (voters.length !== voterIdList.length) {
            throw new Error('One or more voter IDs are invalid');
        }

        // Determine initial status based on dates
        let status = 'upcoming';
        const now = new Date();
        if (start <= now && now <= end) {
            status = 'active';
            console.log('Setting election as active:', {
                start,
                end,
                now
            });
        } else if (now > end) {
            status = 'completed';
        }

        console.log('Election status determined:', {
            start,
            end,
            now,
            status
        });

        // Create election first
        const election = new Election({
            title,
            description,
            startDate: start,
            endDate: end,
            status,
            createdBy: req.session.user.id,
            eligibleVoters: voterIdList.map(voterId => ({
                voterId: voterId.trim(),
                addedBy: req.session.user.id
            }))
        });

        console.log('Creating election with voters:', {
            voterCount: voterIdList.length,
            voters: voterIdList
        });

        await election.save();
        console.log('Election created:', {
            id: election._id,
            title: election.title,
            status: election.status,
            eligibleVotersCount: election.eligibleVoters.length
        });

        // Create candidates
        const candidatePromises = candidates.map(async (candidate) => {
            const newCandidate = new Candidate({
                name: candidate.name,
                description: candidate.description,
                election: election._id
            });
            await newCandidate.save();
            return newCandidate._id;
        });

        const candidateIds = await Promise.all(candidatePromises);
        election.candidates = candidateIds;
        await election.save();

        console.log('Candidates created:', {
            electionId: election._id,
            candidateCount: candidateIds.length
        });

        res.redirect('/admin?success=Election created successfully');
    } catch (error) {
        console.error('Create election error:', error);
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

// Add voter to election
exports.addVoter = async (req, res) => {
    try {
        const { electionId } = req.params;
        const { voterId } = req.body;

        if (!voterId) {
            return res.status(400).json({ error: 'Voter ID is required' });
        }

        const election = await Election.findById(electionId);
        if (!election) {
            return res.status(404).json({ error: 'Election not found' });
        }

        // Check if voter exists
        const voter = await User.findOne({ voterId });
        if (!voter) {
            return res.status(404).json({ error: 'Voter not found' });
        }

        const added = await election.addEligibleVoter(voterId, req.session.user.id);
        if (!added) {
            return res.status(400).json({ error: 'Voter is already eligible for this election' });
        }

        res.json({ message: 'Voter added successfully' });
    } catch (error) {
        console.error('Add voter error:', error);
        res.status(500).json({ error: 'Failed to add voter' });
    }
};

// Remove voter from election
exports.removeVoter = async (req, res) => {
    try {
        const { electionId } = req.params;
        const { voterId } = req.body;

        if (!voterId) {
            return res.status(400).json({ error: 'Voter ID is required' });
        }

        const election = await Election.findById(electionId);
        if (!election) {
            return res.status(404).json({ error: 'Election not found' });
        }

        const removed = await election.removeEligibleVoter(voterId);
        if (!removed) {
            return res.status(400).json({ error: 'Voter is not in the eligible list' });
        }

        res.json({ message: 'Voter removed successfully' });
    } catch (error) {
        console.error('Remove voter error:', error);
        res.status(500).json({ error: 'Failed to remove voter' });
    }
};

// Add candidate to election
exports.addCandidate = async (req, res) => {
    try {
        const { electionId } = req.params;
        const { name, description } = req.body;

        if (!name || !description) {
            return res.status(400).json({ error: 'Name and description are required' });
        }

        const election = await Election.findById(electionId);
        if (!election) {
            return res.status(404).json({ error: 'Election not found' });
        }

        // Create new candidate
        const candidate = new Candidate({
            name,
            description,
            election: electionId
        });

        await candidate.save();

        // Add candidate to election
        election.candidates.push(candidate._id);
        await election.save();

        res.json({ message: 'Candidate added successfully', candidate });
    } catch (error) {
        console.error('Add candidate error:', error);
        res.status(500).json({ error: 'Failed to add candidate' });
    }
};

// Remove candidate from election
exports.removeCandidate = async (req, res) => {
    try {
        const { electionId, candidateId } = req.params;

        const election = await Election.findById(electionId);
        if (!election) {
            return res.status(404).json({ error: 'Election not found' });
        }

        // Remove candidate from election
        election.candidates = election.candidates.filter(id => id.toString() !== candidateId);
        await election.save();

        // Delete candidate
        await Candidate.findByIdAndDelete(candidateId);

        res.json({ message: 'Candidate removed successfully' });
    } catch (error) {
        console.error('Remove candidate error:', error);
        res.status(500).json({ error: 'Failed to remove candidate' });
    }
};

// Get election results
exports.getResults = async (req, res) => {
    try {
        const { electionId } = req.params;

        const election = await Election.findById(electionId)
            .populate('candidates')
            .populate('eligibleVoters.addedBy', 'name email');

        if (!election) {
            return res.status(404).json({ error: 'Election not found' });
        }

        // Get vote counts for each candidate
        const candidates = await Promise.all(election.candidates.map(async (candidate) => {
            const voteCount = await Vote.countDocuments({
                election: electionId,
                candidate: candidate._id
            });
            return {
                ...candidate.toObject(),
                voteCount
            };
        }));

        // Get total votes cast
        const totalVotes = await Vote.countDocuments({ election: electionId });

        // Get eligible voters count
        const eligibleVotersCount = election.eligibleVoters.length;

        res.json({
            election: {
                ...election.toObject(),
                candidates,
                totalVotes,
                eligibleVotersCount
            }
        });
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ error: 'Failed to get election results' });
    }
};

// Check voter eligibility
exports.checkEligibility = async (req, res) => {
    try {
        const { electionId } = req.params;
        const { voterId } = req.query;

        if (!voterId) {
            return res.status(400).json({ error: 'Voter ID is required' });
        }

        const election = await Election.findById(electionId);
        if (!election) {
            return res.status(404).json({ error: 'Election not found' });
        }

        const isEligible = election.isVoterEligible(voterId);
        res.json({ isEligible });
    } catch (error) {
        console.error('Check eligibility error:', error);
        res.status(500).json({ error: 'Failed to check eligibility' });
    }
}; 