const User = require('../models/User');
const Election = require('../models/Election');
const Vote = require('../models/Vote');

exports.getProfile = async (req, res) => {
    try {
        // Get user data
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.redirect('/auth/login');
        }

        console.log('User data:', {
            id: user._id,
            voterId: user.voterId,
            name: user.name
        });

        // Get all active elections first
        const allActiveElections = await Election.find({
            status: 'active',
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        })
            .populate('candidates')
            .populate('eligibleVoters.addedBy', 'name email');

        console.log('All active elections:', allActiveElections.map(e => ({
            id: e._id,
            title: e.title,
            eligibleVoters: e.eligibleVoters
        })));

        // Get elections user has voted in
        const votes = await Vote.find({ voter: user._id })
            .populate({
                path: 'election',
                populate: {
                    path: 'candidates'
                }
            });

        console.log('User votes:', {
            userId: user._id,
            votesFound: votes.length,
            voteDetails: votes.map(v => ({
                electionId: v.election._id,
                votedAt: v.createdAt
            }))
        });

        // Get eligible elections (active elections where user hasn't voted)
        const eligibleElections = [];
        for (const election of allActiveElections) {
            const hasVoted = await Vote.hasUserVoted(user._id, election._id);
            console.log('Vote check:', {
                electionId: election._id,
                userId: user._id,
                hasVoted: hasVoted
            });
            if (!hasVoted) {
                eligibleElections.push(election);
            }
        }

        // Filter elections where user is eligible to vote
        const filteredEligibleElections = eligibleElections.filter(election => {
            const isEligible = election.isVoterEligible(user.voterId);
            console.log('Eligibility check:', {
                electionId: election._id,
                voterId: user.voterId,
                isEligible: isEligible
            });
            return isEligible;
        });

        console.log('Final filtered eligible elections:', filteredEligibleElections.map(e => ({
            id: e._id,
            title: e.title
        })));

        // Get voted elections with vote details
        const votedElections = votes.map(vote => ({
            ...vote.election.toObject(),
            votedAt: vote.createdAt,
            status: vote.election.status
        }));

        console.log('Voted elections:', votedElections.map(e => ({
            id: e._id,
            title: e.title
        })));

        res.render('profile', {
            user: {
                name: user.name,
                email: user.email,
                voterId: user.voterId,
                role: user.role
            },
            eligibleElections: filteredEligibleElections,
            votedElections,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.render('profile', {
            error: 'Error loading profile data',
            user: req.session.user
        });
    }
}; 