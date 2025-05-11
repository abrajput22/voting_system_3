const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/tokenUtils');

// Google OAuth configuration
passport.use(new (require('passport-google-oauth20').Strategy)({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
},
    async function (accessToken, refreshToken, profile, done) {
        try {
            // Check if user already exists
            let user = await User.findOne({ email: profile.emails[0].value });

            if (!user) {
                // Create new user if doesn't exist
                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    role: 'voter',
                    hasPassword: false // Flag to indicate if user needs to set password
                });
                await user.save();
            } else if (!user.googleId) {
                // If user exists but hasn't linked Google account
                user.googleId = profile.id;
                await user.save();
            }

            return done(null, user);
        } catch (error) {
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
        // Check if user needs to set password
        if (!req.user.hasPassword) {
            return res.redirect('/auth/set-password');
        }

        // Set user session
        req.session.user = {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        };

        // Send tokens in response
        res.cookie('refreshToken', req.user.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Set access token in response header
        res.setHeader('Authorization', `Bearer ${req.user.accessToken}`);

        // Redirect based on role
        if (req.user.role === 'admin') {
            res.redirect('/admin');
        } else {
            res.redirect('/voting');
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
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.redirect('/auth/login?error=Invalid credentials');
        }

        // Check if user has password
        if (!user.hasPassword) {
            return res.redirect('/auth/login?error=Please login with Google');
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.redirect('/auth/login?error=Invalid credentials');
        }

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
        console.error('Login error:', error);
        res.redirect('/auth/login?error=' + encodeURIComponent(error.message));
    }
});

// Register page
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register', { error: req.query.error });
});

// Register process
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, confirmPassword } = req.body;

        // Validate input
        if (!name || !email || !password || !confirmPassword) {
            return res.redirect('/auth/register?error=All fields are required');
        }

        if (password.length < 6) {
            return res.redirect('/auth/register?error=Password must be at least 6 characters long');
        }

        if (password !== confirmPassword) {
            return res.redirect('/auth/register?error=Passwords do not match');
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.redirect('/auth/register?error=Email already registered');
        }

        // Create new user
        const user = new User({
            name,
            email,
            password,
            role: 'voter',
            hasPassword: true
        });

        await user.save();
        console.log('User registered successfully:', { email: user.email, name: user.name });

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

        res.redirect('/voting');
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === 11000) {
            return res.redirect('/auth/register?error=Email already registered');
        }
        res.redirect('/auth/register?error=' + encodeURIComponent(error.message));
    }
});

// Logout
router.get('/logout', async (req, res) => {
    try {
        if (req.session.user) {
            // Increment token version to invalidate all tokens
            const user = await User.findById(req.session.user.id);
            if (user) {
                await user.incrementTokenVersion();
            }
        }

        // Clear session
        req.session.destroy();

        // Clear refresh token cookie
        res.clearCookie('refreshToken');

        res.redirect('/');
    } catch (error) {
        console.error('Logout error:', error);
        res.redirect('/');
    }
});

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