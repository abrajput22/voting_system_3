const { verifyAccessToken, verifyRefreshToken } = require('../utils/tokenUtils');
const User = require('../models/User');
const axios = require('axios');

// Hybrid authentication middleware
const isAuthenticated = async (req, res, next) => {
    try {
        // Check session first
        if (req.session.user) {
            return next();
        }

        // Check for JWT token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.redirect('/auth/login');
        }

        const token = authHeader.split(' ')[1];
        try {
            const decoded = verifyAccessToken(token);

            // Get user and check token version
            const user = await User.findById(decoded.id);
            if (!user || user.tokenVersion !== decoded.tokenVersion) {
                return res.redirect('/auth/login');
            }

            // Set user in request
            req.user = {
                id: user._id,
                email: user.email,
                role: user.role
            };

            next();
        } catch (error) {
            // Access token expired, try to refresh
            try {
                const response = await axios.post('http://localhost:3000/auth/refresh-token', {}, {
                    headers: {
                        Cookie: `refreshToken=${req.cookies.refreshToken}`
                    }
                });

                // Set new access token in request
                req.headers.authorization = `Bearer ${response.data.accessToken}`;

                // Get user from new token
                const decoded = verifyAccessToken(response.data.accessToken);
                const user = await User.findById(decoded.id);

                // Set user in request
                req.user = {
                    id: user._id,
                    email: user.email,
                    role: user.role
                };

                next();
            } catch (refreshError) {
                // Refresh failed, redirect to login
                return res.redirect('/auth/login');
            }
        }
    } catch (error) {
        console.error('Authentication error:', error);
        res.redirect('/auth/login');
    }
};

// Admin middleware
const isAdmin = async (req, res, next) => {
    try {
        // Check session first
        if (req.session.user && req.session.user.role === 'admin') {
            return next();
        }

        // Check for JWT token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(403).render('error', { error: 'Access denied. Admin privileges required.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyAccessToken(token);

        // Get user and check token version
        const user = await User.findById(decoded.id);
        if (!user || user.tokenVersion !== decoded.tokenVersion || user.role !== 'admin') {
            return res.status(403).render('error', { error: 'Access denied. Admin privileges required.' });
        }

        // Set user in request
        req.user = {
            id: user._id,
            email: user.email,
            role: user.role
        };

        next();
    } catch (error) {
        console.error('Admin authentication error:', error);
        res.status(403).render('error', { error: 'Access denied. Admin privileges required.' });
    }
};

// Voter middleware
const isVoter = async (req, res, next) => {
    try {
        // Check session first
        if (req.session.user && req.session.user.role === 'voter') {
            return next();
        }

        // Check for JWT token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(403).render('error', { error: 'Access denied. Voter privileges required.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyAccessToken(token);

        // Get user and check token version
        const user = await User.findById(decoded.id);
        if (!user || user.tokenVersion !== decoded.tokenVersion || user.role !== 'voter') {
            return res.status(403).render('error', { error: 'Access denied. Voter privileges required.' });
        }

        // Set user in request
        req.user = {
            id: user._id,
            email: user.email,
            role: user.role
        };

        next();
    } catch (error) {
        console.error('Voter authentication error:', error);
        res.status(403).render('error', { error: 'Access denied. Voter privileges required.' });
    }
};

module.exports = {
    isAuthenticated,
    isAdmin,
    isVoter
}; 