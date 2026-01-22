const jwt = require('jsonwebtoken');

function extractToken(req) {
	const auth = req.headers && req.headers.authorization;
	if (!auth) return null;
	const parts = auth.split(' ');
	if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
	return null;
}

function authenticateToken(req, res, next) {
	const token = extractToken(req);
	if (!token) return res.status(401).json({ error: 'Missing Authorization token' });

	try {
		const secret = process.env.JWT_SECRET || 'secret';
		const payload = jwt.verify(token, secret);
		req.user = {
			userId: payload.userId || payload.sub || payload.id,
			userType: payload.userType || payload.role || 'user'
		};
		return next();
	} catch (err) {
		return res.status(401).json({ error: 'Invalid token' });
	}
}

// Lightweight: controllers perform final ownership checks; this middleware
// ensures caller is authenticated. isOwnerOrAdmin intentionally allows through
// so controllers can return specific errors, but we keep the helper to allow
// future stricter checks.
function isOwnerOrAdmin(req, res, next) {
	if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
	return next();
}

function isAdmin(req, res, next) {
	if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
	if (!['admin', 'superadmin'].includes(req.user.userType)) {
		return res.status(403).json({ error: 'Admin role required' });
	}
	return next();
}

module.exports = { authenticateToken, isOwnerOrAdmin, isAdmin };

