const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/tokenUtils');
const authController = require('../controllers/authController');

// Google OAuth configuration
passport.use(new (require('passport-google-oauth20').Strategy)({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
},
    async function (accessToken, refreshToken, profile, done) {
        try {
            console.log('Google OAuth callback received:', {
                email: profile.emails[0].value,
                name: profile.displayName,
                googleId: profile.id
            });

            // Check if user already exists
            let user = await User.findOne({ email: profile.emails[0].value });

            if (!user) {
                console.log('Creating new user from Google OAuth');

                // Generate voter ID for new user
                const voterId = await User.generateVoterId();
                console.log('Generated voter ID for new user:', voterId);

                // Create new user if doesn't exist
                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    role: 'voter',
                    voterId: voterId,
                    hasPassword: false
                });

                await user.save();
                console.log('New user created successfully:', {
                    id: user._id,
                    email: user.email,
                    voterId: user.voterId
                });
            } else if (!user.googleId) {
                console.log('Linking existing user with Google account:', user._id);
                // If user exists but hasn't linked Google account
                user.googleId = profile.id;
                await user.save();
                console.log('Google account linked successfully');
            } else {
                console.log('Existing Google user logged in:', user._id);
            }

            return done(null, user);
        } catch (error) {
            console.error('Google OAuth error:', error);
            return done(error, null);
        }
    }));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Google OAuth routes
router.get('/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })
);

router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/auth/login',
        failureMessage: true
    }),
    (req, res) => {
        try {
            console.log('Google OAuth callback successful, setting session for user:', req.user._id);

            // Set user session
            req.session.user = {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
                voterId: req.user.voterId
            };

            console.log('Session set successfully, redirecting based on role');
            // Redirect based on role
            if (req.user.role === 'admin') {
                res.redirect('/admin');
            } else {
                res.redirect('/voting');
            }
        } catch (error) {
            console.error('Error in Google callback:', error);
            res.redirect('/auth/login?error=' + encodeURIComponent('Authentication failed'));
        }
    }
);

// Password setup page for Google users
router.get('/set-password', (req, res) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }
    if (req.user.hasPassword) {
        return res.redirect('/');
    }
    res.render('set-password', { error: req.query.error });
});

// Password setup process
router.post('/set-password', async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/auth/login');
        }

        const { password, confirmPassword } = req.body;

        if (!password || !confirmPassword) {
            return res.redirect('/auth/set-password?error=All fields are required');
        }

        if (password.length < 6) {
            return res.redirect('/auth/set-password?error=Password must be at least 6 characters long');
        }

        if (password !== confirmPassword) {
            return res.redirect('/auth/set-password?error=Passwords do not match');
        }

        const user = await User.findById(req.user._id);
        user.password = password;
        user.hasPassword = true;
        await user.save();

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Set user session
        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        };

        // Send tokens in response
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect based on role
        if (user.role === 'admin') {
            res.redirect('/admin');
        } else {
            res.redirect('/voting');
        }
    } catch (error) {
        console.error('Password setup error:', error);
        res.redirect('/auth/set-password?error=' + encodeURIComponent(error.message));
    }
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).json({ message: 'Access denied' });
};

// Regular login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login', { error: req.query.error });
});

// Regular login process
router.post('/login', authController.login);

// Register page
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register', { error: req.query.error });
});

// Register process
router.post('/register', authController.register);

// Logout
router.get('/logout', authController.logout);

// Refresh token route
router.post('/refresh-token', async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token not found' });
        }

        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken);

        // Get user and check token version
        const user = await User.findById(decoded.id);
        if (!user || user.tokenVersion !== decoded.tokenVersion) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        // Generate new tokens
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        // Update user's tokens
        user.accessToken = newAccessToken;
        user.refreshToken = newRefreshToken;
        await user.save();

        // Set new refresh token in cookie
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Send new access token
        res.json({ accessToken: newAccessToken });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ message: 'Invalid refresh token' });
    }
});

module.exports = router; 