const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const Election = require('../models/Election');
const User = require('../models/User');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const mongoose = require('mongoose');

// Helper to ensure ObjectId type
function toObjectId(id) {
    if (!id) return id;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
    if (id.constructor && id.constructor.name === 'ObjectId') return id;
    return id;
}

// Voting dashboard - show active elections
router.get('/', isAuthenticated, async (req, res) => {
    try {
        // Log user session data
        console.log('User session data:', {
            userId: req.session.user.id,
            voterId: req.session.user.voterId,
            userIdType: typeof req.session.user.id,
            userIdInstance: req.session.user.id && req.session.user.id.constructor ? req.session.user.id.constructor.name : null
        });

        // Get all active elections
        const allActiveElections = await Election.find({
            status: 'active',
            endDate: { $gte: new Date() }
        }).populate('candidates');

        console.log('Found active elections:', {
            count: allActiveElections.length,
            elections: allActiveElections.map(e => ({
                id: e._id,
                title: e.title
            }))
        });

        // Process each election to add eligibility information and check votes
        const activeElections = [];
        for (const election of allActiveElections) {
            const userObjectId = toObjectId(req.session.user.id);
            const hasVoted = await Vote.hasUserVoted(
                userObjectId,
                election._id
            );

            console.log('Vote check:', {
                electionId: election._id,
                userId: req.session.user.id,
                hasVoted: hasVoted
            });

            if (!hasVoted) {
                const isEligible = election.isVoterEligible(req.session.user.voterId);
                console.log('Eligibility check:', {
                    electionId: election._id,
                    voterId: req.session.user.voterId,
                    isEligible: isEligible
                });

                activeElections.push({
                    ...election.toObject(),
                    isEligible
                });
            }
        }

        // Get completed elections user has voted in
        const votes = await Vote.find({
            voter: toObjectId(req.session.user.id)
        }).populate({
            path: 'election',
            populate: {
                path: 'candidates'
            }
        });

        const completedElections = votes
            .filter(vote => vote.election.status === 'completed')
            .map(vote => vote.election);

        console.log('Final counts:', {
            activeCount: activeElections.length,
            completedCount: completedElections.length
        });

        res.render('voting/dashboard', {
            user: req.session.user,
            activeElections,
            completedElections,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('Voting dashboard error:', error);
        res.render('voting/dashboard', {
            user: req.session.user,
            activeElections: [],
            completedElections: [],
            error: 'Failed to load elections: ' + error.message,
            success: null
        });
    }
});

// View specific election
router.get('/election/:id', isAuthenticated, async (req, res) => {
    try {
        const electionId = req.params.id;

        // Validate election ID
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.redirect('/voting?error=Invalid election ID');
        }

        const election = await Election.findById(electionId).populate('candidates');

        if (!election) {
            return res.redirect('/voting?error=Election not found');
        }

        // Check if election is active
        if (election.status !== 'active') {
            return res.redirect('/voting?error=This election is not active');
        }

        // Check if user is eligible to vote
        const isEligible = election.isVoterEligible(req.session.user.voterId);
        console.log('Voter eligibility check:', {
            voterId: req.session.user.voterId,
            electionId: election._id,
            isEligible: isEligible
        });

        if (!isEligible) {
            return res.redirect('/voting?error=You are not eligible to vote in this election');
        }

        // Check for existing vote
        const existingVote = await Vote.findOne({
            election: election._id,
            voter: toObjectId(req.session.user.id)
        });

        console.log('Vote check:', {
            userId: req.session.user.id,
            electionId: election._id,
            hasVoted: !!existingVote
        });

        if (existingVote) {
            return res.redirect('/voting?error=You have already voted in this election');
        }

        res.render('voting/election', {
            user: req.session.user,
            election,
            error: req.query.error
        });
    } catch (error) {
        console.error('View election error:', error);
        res.redirect('/voting?error=' + encodeURIComponent(error.message));
    }
});

// Cast vote
router.post('/vote', isAuthenticated, async (req, res) => {
    try {
        const { electionId, candidateId } = req.body;

        console.log('Vote attempt:', {
            electionId: electionId,
            candidateId: candidateId,
            userId: req.session.user.id,
            voterId: req.session.user.voterId
        });

        // Validate IDs
        if (!mongoose.Types.ObjectId.isValid(electionId) || !mongoose.Types.ObjectId.isValid(candidateId)) {
            console.log('Invalid ID format:', { electionId, candidateId });
            return res.redirect('/voting?error=Invalid election or candidate ID');
        }

        // Check if election exists and is active
        const election = await Election.findById(electionId);
        if (!election) {
            console.log('Election not found:', electionId);
            return res.redirect('/voting?error=Election not found');
        }

        if (election.status !== 'active') {
            console.log('Election not active:', {
                electionId: electionId,
                status: election.status
            });
            return res.redirect('/voting?error=This election is not active');
        }

        // Check if user is eligible
        const isEligible = election.isVoterEligible(req.session.user.voterId);
        console.log('Vote eligibility check:', {
            voterId: req.session.user.voterId,
            isEligible: isEligible,
            electionId: electionId
        });

        if (!isEligible) {
            return res.redirect('/voting?error=You are not eligible to vote in this election');
        }

        // Check for existing vote using proper ObjectId
        const existingVote = await Vote.findOne({
            election: toObjectId(electionId),
            voter: toObjectId(req.session.user.id)
        });

        console.log('Vote check result:', {
            electionId: electionId,
            userId: req.session.user.id,
            hasVoted: !!existingVote,
            voteId: existingVote ? existingVote._id : null
        });

        if (existingVote) {
            return res.redirect('/voting?error=You have already voted in this election');
        }

        // Verify candidate belongs to election
        const candidate = await Candidate.findById(candidateId);
        if (!candidate || !election.candidates.includes(candidateId)) {
            console.log('Invalid candidate:', {
                candidateId: candidateId,
                electionCandidates: election.candidates
            });
            return res.redirect('/voting?error=Invalid candidate');
        }

        // Create vote record
        const vote = new Vote({
            election: toObjectId(electionId),
            voter: toObjectId(req.session.user.id),
            candidate: toObjectId(candidateId)
        });

        await vote.save();

        console.log('Vote recorded successfully:', {
            voteId: vote._id,
            electionId: electionId,
            userId: req.session.user.id
        });

        // Update user's voted elections
        await User.findByIdAndUpdate(
            req.session.user.id,
            { $addToSet: { votedElections: toObjectId(electionId) } }
        );

        res.redirect('/voting?success=Vote cast successfully');
    } catch (error) {
        console.error('Vote casting error:', error);
        res.redirect('/voting?error=' + encodeURIComponent(error.message));
    }
});

// View election results
router.get('/results/:id', isAuthenticated, async (req, res) => {
    try {
        const election = await Election.findById(req.params.id).populate('candidates');
        if (!election) {
            return res.redirect('/voting?error=Election not found');
        }

        if (election.status !== 'completed') {
            return res.redirect('/voting?error=Results are only available for completed elections');
        }

        // Calculate live vote counts for each candidate
        const candidatesWithVotes = await Promise.all(
            election.candidates.map(async candidate => {
                const votes = await Vote.countDocuments({
                    election: election._id,
                    candidate: candidate._id
                });
                return { ...candidate.toObject(), votes };
            })
        );

        res.render('voting/results', {
            user: req.session.user,
            election: {
                ...election.toObject(),
                candidates: candidatesWithVotes
            }
        });
    } catch (error) {
        console.error('View results error:', error);
        res.redirect('/voting?error=' + encodeURIComponent(error.message));
    }
});

// Debug route to check election status
router.get('/debug/elections', isAuthenticated, async (req, res) => {
    try {
        // Get all elections regardless of status
        const allElections = await Election.find({}).populate('candidates');

        const electionStatus = allElections.map(election => ({
            id: election._id,
            title: election.title,
            status: election.status,
            startDate: election.startDate,
            endDate: election.endDate,
            isActive: election.isActive(),
            candidatesCount: election.candidates.length,
            eligibleVotersCount: election.eligibleVoters.length,
            userIsEligible: election.isVoterEligible(req.session.user.voterId)
        }));

        res.json({
            currentUser: {
                id: req.session.user.id,
                voterId: req.session.user.voterId
            },
            elections: electionStatus,
            currentTime: new Date()
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

module.exports = router; 