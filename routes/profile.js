const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/User');
const Election = require('../models/Election');
const Candidate = require('../models/Candidate');

// Profile page
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        const votedElections = await Election.find({
            _id: { $in: user.votedElections }
        }).populate('candidates');

        res.render('profile', {
            user: req.session.user,
            votedElections,
            error: req.query.error
        });
    } catch (error) {
        res.status(500).render('error', { error: error.message });
    }
});

// Update profile
router.post('/update', isAuthenticated, async (req, res) => {
    try {
        const { name, email } = req.body;

        // Validate input
        if (!name || !email) {
            throw new Error('Name and email are required');
        }

        // Update user
        await User.findByIdAndUpdate(req.session.user.id, {
            name,
            email
        });

        // Update session
        req.session.user = {
            ...req.session.user,
            name,
            email
        };

        res.redirect('/profile?success=Profile updated successfully');
    } catch (error) {
        res.redirect('/profile?error=' + encodeURIComponent(error.message));
    }
});

module.exports = router; 