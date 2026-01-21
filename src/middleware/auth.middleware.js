const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) return res.status(401).json({ success: false, error: { message: 'Authorization header missing' } });

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) return res.status(500).json({ success: false, error: { message: 'Server misconfigured: JWT secret missing' } });

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.user = { id: payload.userId || payload.id || payload.sub, raw: payload };
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, error: { message: 'Invalid or expired token' } });
  }
};

module.exports = authMiddleware;
