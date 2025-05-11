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

        const user = await User.create({
            name,
            email,
            password,
            role
        });

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