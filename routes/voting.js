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
            activeElections
        });
    } catch (error) {
        console.error('Voting dashboard error:', error);
        req.flash('error_msg', 'Failed to load elections');
        res.render('voting/dashboard', {
            user: req.session.user,
            activeElections: []
        });
    }
});

// View specific election
router.get('/election/:id', isAuthenticated, async (req, res) => {
    try {
        const election = await Election.findById(req.params.id).populate('candidates');
        if (!election) {
            req.flash('error_msg', 'Election not found');
            return res.redirect('/voting');
        }

        if (election.status !== 'active') {
            req.flash('error_msg', 'This election is not active');
            return res.redirect('/voting');
        }

        // Check if user has already voted
        const user = await User.findById(req.session.user.id);
        if (user.votedElections.includes(election._id)) {
            req.flash('error_msg', 'You have already voted in this election');
            return res.redirect('/voting');
        }

        res.render('voting/election', {
            user: req.session.user,
            election
        });
    } catch (error) {
        console.error('View election error:', error);
        req.flash('error_msg', error.message);
        res.redirect('/voting');
    }
});

// Cast vote
router.post('/vote', isAuthenticated, async (req, res) => {
    try {
        const { electionId, candidateId } = req.body;
        if (!electionId || !candidateId) {
            req.flash('error_msg', 'Invalid vote data');
            return res.redirect('/voting');
        }

        // Check if election exists and is active
        const election = await Election.findById(electionId);
        if (!election) {
            req.flash('error_msg', 'Election not found');
            return res.redirect('/voting');
        }
        if (election.status !== 'active') {
            req.flash('error_msg', 'This election is not active');
            return res.redirect('/voting');
        }

        // Check if user has already voted
        const user = await User.findById(req.session.user.id);
        if (user.votedElections.includes(electionId)) {
            req.flash('error_msg', 'You have already voted in this election');
            return res.redirect('/voting');
        }

        // Check if candidate exists and belongs to the election
        const candidate = await Candidate.findById(candidateId);
        if (!candidate || !election.candidates.includes(candidateId)) {
            req.flash('error_msg', 'Invalid candidate');
            return res.redirect('/voting');
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

        req.flash('success_msg', 'Vote cast successfully');
        res.redirect('/voting');
    } catch (error) {
        console.error('Vote casting error:', error);
        req.flash('error_msg', error.message);
        res.redirect('/voting');
    }
});

// View election results
router.get('/results/:id', isAuthenticated, async (req, res) => {
    try {
        const election = await Election.findById(req.params.id).populate('candidates');
        if (!election) {
            req.flash('error_msg', 'Election not found');
            return res.redirect('/voting');
        }

        if (election.status !== 'completed') {
            req.flash('error_msg', 'Results are only available for completed elections');
            return res.redirect('/voting');
        }

        res.render('voting/results', {
            user: req.session.user,
            election
        });
    } catch (error) {
        console.error('View results error:', error);
        req.flash('error_msg', error.message);
        res.redirect('/voting');
    }
});

module.exports = router; 