const bcrypt = require('bcryptjs');
const User = require('../models/User');

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.render('register', {
                error: 'All fields are required',
                user: req.session.user
            });
        }

        if (password.length < 6) {
            return res.render('register', {
                error: 'Password must be at least 6 characters long',
                user: req.session.user
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('register', {
                error: 'Email already registered',
                user: req.session.user
            });
        }

        // Generate voter ID
        const voterId = await User.generateVoterId();
        console.log('Generated voter ID:', voterId);

        // Create user data object
        const userData = {
            name,
            email,
            password,
            role: 'voter',
            voterId,
            hasPassword: true
        };

        console.log('Creating user with data:', { ...userData, password: '[REDACTED]' });

        // Create the user
        const user = await User.create(userData);

        console.log('User created successfully:', { id: user._id, voterId: user.voterId });

        // Set session data
        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            voterId: user.voterId
        };

        // Show success page with voter ID
        res.render('register-success', {
            user: req.session.user,
            voterId: user.voterId
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.render('register', {
            error: error.message || 'An error occurred during registration',
            user: req.session.user
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.render('login', {
                error: 'Email and password are required',
                user: req.session.user
            });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('login', {
                error: 'Invalid email or password',
                user: req.session.user
            });
        }

        // Check if user has password
        if (!user.hasPassword) {
            return res.render('login', {
                error: 'Please login with Google',
                user: req.session.user
            });
        }

        // Verify password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.render('login', {
                error: 'Invalid email or password',
                user: req.session.user
            });
        }

        // Set session data
        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            voterId: user.voterId
        };

        // Redirect based on role
        if (user.role === 'admin') {
            res.redirect('/admin');
        } else {
            res.redirect('/voting');
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', {
            error: error.message || 'An error occurred during login',
            user: req.session.user
        });
    }
};

exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
}; 