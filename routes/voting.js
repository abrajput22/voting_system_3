const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const Election = require('../models/Election');
const User = require('../models/User');
const Candidate = require('../models/Candidate');

// Voting dashboard - show active elections
router.get('/', isAuthenticated, async (req, res) => {
    try {
        // Get active elections that user hasn't voted in
        const activeElections = await Election.find({
            status: 'active',
            _id: { $nin: req.session.user.votedElections || [] }
        }).populate('candidates');

        res.render('voting/dashboard', {
            user: req.session.user,
            activeElections,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Voting dashboard error:', error);
        res.render('voting/dashboard', {
            user: req.session.user,
            activeElections: [],
            error: 'Failed to load elections'
        });
    }
});

// View specific election
router.get('/election/:id', isAuthenticated, async (req, res) => {
    try {
        const election = await Election.findById(req.params.id).populate('candidates');
        if (!election) {
            return res.redirect('/voting?error=Election not found');
        }

        if (election.status !== 'active') {
            return res.redirect('/voting?error=This election is not active');
        }

        // Check if user has already voted
        const user = await User.findById(req.session.user.id);
        if (user.votedElections.includes(election._id)) {
            return res.redirect('/voting?error=You have already voted in this election');
        }

        res.render('voting/election', {
            user: req.session.user,
            election
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
        if (!electionId || !candidateId) {
            return res.redirect('/voting?error=Invalid vote data');
        }

        // Check if election exists and is active
        const election = await Election.findById(electionId);
        if (!election) {
            return res.redirect('/voting?error=Election not found');
        }
        if (election.status !== 'active') {
            return res.redirect('/voting?error=This election is not active');
        }

        // Check if user has already voted
        const user = await User.findById(req.session.user.id);
        if (user.votedElections.includes(electionId)) {
            return res.redirect('/voting?error=You have already voted in this election');
        }

        // Check if candidate exists and belongs to the election
        const candidate = await Candidate.findById(candidateId);
        if (!candidate || !election.candidates.includes(candidateId)) {
            return res.redirect('/voting?error=Invalid candidate');
        }

        // Update candidate votes
        await Candidate.findByIdAndUpdate(candidateId, { $inc: { votes: 1 } });

        // Update user's voted elections
        user.votedElections.push(electionId);
        await user.save();

        // Update session
        req.session.user = {
            ...req.session.user,
            votedElections: user.votedElections
        };

        console.log('Vote cast successfully:', {
            userId: user._id,
            electionId,
            candidateId
        });

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

        res.render('voting/results', {
            user: req.session.user,
            election
        });
    } catch (error) {
        console.error('View results error:', error);
        res.redirect('/voting?error=' + encodeURIComponent(error.message));
    }
});

module.exports = router; 