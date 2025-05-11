const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken } = require('../utils/tokenUtils');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
},
    async function (accessToken, refreshToken, profile, done) {
        try {
            // Check if user already exists
            let user = await User.findOne({ email: profile.emails[0].value });

            if (!user) {
                // Check if the email is admin email
                const isAdmin = profile.emails[0].value === 'abhishekrajput221170@acropolis.in';

                // Create new user if doesn't exist
                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    role: isAdmin ? 'admin' : 'voter',
                    hasPassword: false // Flag to indicate if user needs to set password
                });
                await user.save();
            } else if (!user.googleId) {
                // If user exists but hasn't linked Google account
                user.googleId = profile.id;
                // Preserve the existing role
                await user.save();
            }

            // Generate tokens
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);

            // Add tokens to user object
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;

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

module.exports = passport; 