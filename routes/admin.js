const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const Election = require('../models/Election');
const Candidate = require('../models/Candidate');
const User = require('../models/User');
const electionController = require('../controllers/electionController');
const Vote = require('../models/Vote');

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
        console.log('Received election creation request:', {
            title,
            description,
            startDate,
            endDate,
            candidates
        });

        // Validate input
        if (!title || !description || !startDate || !endDate || !candidates) {
            console.error('Missing required fields:', { title, description, startDate, endDate, candidates });
            return res.redirect('/admin/create?error=All fields are required');
        }

        // Validate candidates array
        if (!Array.isArray(candidates) || candidates.length === 0) {
            console.error('Invalid candidates data:', candidates);
            return res.redirect('/admin/create?error=At least one candidate is required');
        }

        // Validate each candidate has required fields
        for (const candidate of candidates) {
            if (!candidate.name || !candidate.description) {
                console.error('Invalid candidate data:', candidate);
                return res.redirect('/admin/create?error=Each candidate must have a name and description');
            }
        }

        // Create election using the controller
        await electionController.createElection(req, res);
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
        const election = await Election.findById(req.params.id)
            .populate('candidates')
            .populate('eligibleVoters.addedBy', 'name email');

        if (!election) {
            return res.redirect('/admin?error=Election not found');
        }

        // Get vote counts for each candidate
        const candidatesWithVotes = await Promise.all(election.candidates.map(async (candidate) => {
            const voteCount = await Vote.countDocuments({
                election: election._id,
                candidate: candidate._id
            });
            return {
                ...candidate.toObject(),
                votes: voteCount
            };
        }));

        // Get total votes cast
        const totalVotes = await Vote.countDocuments({ election: election._id });

        // Get eligible voters count
        const eligibleVotersCount = election.eligibleVoters.length;

        res.render('admin/results', {
            user: req.session.user,
            election: {
                ...election.toObject(),
                candidates: candidatesWithVotes,
                totalVotes,
                eligibleVotersCount
            },
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
            return res.redirect(`/admin?error=Invalid voter ID`);
        }

        // Add voter if not already in the list
        const isAlreadyEligible = election.eligibleVoters.some(voter => voter.voterId === voterId);
        if (!isAlreadyEligible) {
            election.eligibleVoters.push({
                voterId: voterId,
                addedBy: req.session.user.id
            });
            await election.save();
            return res.redirect(`/admin?success=Voter added successfully`);
        }

        res.redirect(`/admin?error=Voter is already eligible for this election`);
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
        const initialLength = election.eligibleVoters.length;
        election.eligibleVoters = election.eligibleVoters.filter(voter => voter.voterId !== voterId);

        if (election.eligibleVoters.length !== initialLength) {
            await election.save();
            return res.redirect(`/admin?success=Voter removed successfully`);
        }

        res.redirect(`/admin?error=Voter is not in the eligible list`);
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

        const user = await User.findOne({ voterId });
        if (!user) {
            return res.render('admin/search-voter', {
                user: req.session.user,
                election,
                searchResult: null,
                error: 'No voter found with the provided Voter ID'
            });
        }

        const isEligible = election.isVoterEligible(voterId);

        res.render('admin/search-voter', {
            user: req.session.user,
            election,
            searchResult: {
                voterId: user.voterId,
                name: user.name,
                email: user.email,
                isEligible
            },
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Search voter error:', error);
        res.redirect('/admin?error=' + encodeURIComponent(error.message));
    }
});

// Voter management routes
router.post('/election/:electionId/voters', isAuthenticated, isAdmin, electionController.addVoter);
router.delete('/election/:electionId/voters', isAuthenticated, isAdmin, electionController.removeVoter);

// Candidate management routes
router.post('/election/:electionId/candidates', isAuthenticated, isAdmin, electionController.addCandidate);
router.delete('/election/:electionId/candidates/:candidateId', isAuthenticated, isAdmin, electionController.removeCandidate);

// Election results route
router.get('/election/:electionId/results', isAuthenticated, isAdmin, electionController.getResults);

// Check voter eligibility route
router.get('/election/:electionId/check-eligibility', isAuthenticated, electionController.checkEligibility);

module.exports = router;