const bcrypt = require('bcryptjs');
const User = require('../models/User');

exports.register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new Error('Email already registered');
        }

        // Validate role
        if (!['user', 'admin'].includes(role)) {
            throw new Error('Invalid role selected');
        }

        // Generate unique voter ID for regular users
        const voterId = role === 'user' ? await User.generateVoterId() : null;

        const user = await User.create({
            name,
            email,
            password,
            role,
            voterId
        });

        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            voterId: user.voterId
        };

        // If user is admin, redirect to admin dashboard
        if (role === 'admin') {
            return res.redirect('/admin');
        }

        // For regular users, show success message with voter ID
        res.render('register-success', {
            user: req.session.user,
            voterId: user.voterId
        });
    } catch (error) {
        res.render('register', {
            error: error.message,
            user: req.session.user
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await user.comparePassword(password))) {
            throw new Error('Invalid email or password');
        }

        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        };

        res.redirect('/');
    } catch (error) {
        throw error;
    }
};

exports.logout = (req, res) => {
    req.session.destroy();
    res.redirect('/');
}; 