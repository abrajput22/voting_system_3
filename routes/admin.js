const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const Election = require('../models/Election');
const Candidate = require('../models/Candidate');
const User = require('../models/User');

// Admin dashboard
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const elections = await Election.find().populate('candidates');
        res.render('admin/dashboard', {
            user: req.session.user,
            elections,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.render('admin/dashboard', {
            user: req.session.user,
            elections: [],
            error: 'Failed to load elections'
        });
    }
});

// Create election page
router.get('/create', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin/create', {
        user: req.session.user,
        error: req.query.error
    });
});

// Create election
router.post('/create', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { title, description, startDate, endDate, candidates } = req.body;

        // Validate input
        if (!title || !description || !startDate || !endDate || !candidates) {
            return res.redirect('/admin/create?error=All fields are required');
        }

        // Create candidates
        const candidatePromises = candidates.map(async (candidate) => {
            const newCandidate = new Candidate({
                name: candidate.name,
                description: candidate.description
            });
            return await newCandidate.save();
        });

        const savedCandidates = await Promise.all(candidatePromises);

        // Create election
        const election = new Election({
            title,
            description,
            startDate,
            endDate,
            candidates: savedCandidates.map(c => c._id),
            status: 'upcoming'
        });

        await election.save();
        console.log('Election created successfully:', { title: election.title });

        res.redirect('/admin?success=Election created successfully');
    } catch (error) {
        console.error('Create election error:', error);
        res.redirect('/admin/create?error=' + encodeURIComponent(error.message));
    }
});

// Update election status
router.post('/status/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const election = await Election.findById(req.params.id);

        if (!election) {
            return res.redirect('/admin?error=Election not found');
        }

        election.status = status;
        await election.save();
        console.log('Election status updated:', { id: election._id, status });

        res.redirect('/admin?success=Election status updated');
    } catch (error) {
        console.error('Update status error:', error);
        res.redirect('/admin?error=' + encodeURIComponent(error.message));
    }
});

// Delete election
router.post('/delete/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const election = await Election.findById(req.params.id);

        if (!election) {
            return res.redirect('/admin?error=Election not found');
        }

        // Delete associated candidates
        await Candidate.deleteMany({ _id: { $in: election.candidates } });

        // Delete election
        await election.deleteOne();
        console.log('Election deleted:', { id: election._id });

        res.redirect('/admin?success=Election deleted successfully');
    } catch (error) {
        console.error('Delete election error:', error);
        res.redirect('/admin?error=' + encodeURIComponent(error.message));
    }
});

// View election results
router.get('/results/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const election = await Election.findById(req.params.id).populate('candidates');

        if (!election) {
            return res.redirect('/admin?error=Election not found');
        }

        res.render('admin/results', {
            user: req.session.user,
            election,
            error: req.query.error
        });
    } catch (error) {
        console.error('View results error:', error);
        res.redirect('/admin?error=' + encodeURIComponent(error.message));
    }
});

// Add voter to election
router.post('/election/:id/add-voter', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { voterId } = req.body;
        const election = await Election.findById(req.params.id);

        if (!election) {
            return res.redirect('/admin?error=Election not found');
        }

        // Check if voter ID exists
        const user = await User.findOne({ voterId });
        if (!user) {
            return res.redirect(`/admin/election/${election._id}?error=Invalid voter ID`);
        }

        // Add voter if not already in the list
        if (!election.eligibleVoters.includes(voterId)) {
            election.eligibleVoters.push(voterId);
            await election.save();
        }

        res.redirect(`/admin/election/${election._id}?success=Voter added successfully`);
    } catch (error) {
        console.error('Add voter error:', error);
        res.redirect('/admin?error=' + encodeURIComponent(error.message));
    }
});

// Remove voter from election
router.post('/election/:id/remove-voter', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { voterId } = req.body;
        const election = await Election.findById(req.params.id);

        if (!election) {
            return res.redirect('/admin?error=Election not found');
        }

        // Remove voter from the list
        election.eligibleVoters = election.eligibleVoters.filter(id => id !== voterId);
        await election.save();

        res.redirect(`/admin/election/${election._id}?success=Voter removed successfully`);
    } catch (error) {
        console.error('Remove voter error:', error);
        res.redirect('/admin?error=' + encodeURIComponent(error.message));
    }
});

// Search voter in election
router.get('/election/:id/search-voter', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { voterId } = req.query;
        const election = await Election.findById(req.params.id);

        if (!election) {
            return res.redirect('/admin?error=Election not found');
        }

        const isEligible = election.eligibleVoters.includes(voterId);
        const user = await User.findOne({ voterId });

        res.render('admin/search-voter', {
            user: req.session.user,
            election,
            searchResult: user ? {
                voterId: user.voterId,
                name: user.name,
                email: user.email,
                isEligible
            } : null,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Search voter error:', error);
        res.redirect('/admin?error=' + encodeURIComponent(error.message));
    }
});

module.exports = router;