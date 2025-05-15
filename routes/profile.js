const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

// Profile page
router.get('/', isAuthenticated, profileController.getProfile);

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