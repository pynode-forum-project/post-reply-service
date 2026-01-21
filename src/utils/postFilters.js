/**
 * Build visibility filter based on user role
 * @param {String} userId - Current user's ID
 * @param {String} userType - Current user's type ('admin', 'superadmin', or regular user)
 * @param {Object} options - Additional filter options
 * @returns {Object} MongoDB filter object
 */
const buildVisibilityFilter = (userId, userType, options = {}) => {
  const isAdmin = ['admin', 'superadmin'].includes(userType);
  const { specificStatus } = options;

  // Admin sees: published, banned, deleted (NOT unpublished or hidden)
  if (isAdmin) {
    const adminStatuses = ['published', 'banned', 'deleted'];
    if (specificStatus && adminStatuses.includes(specificStatus)) {
      return { status: specificStatus };
    }
    return { status: { $in: adminStatuses } };
  }

  // Owner sees: all their own posts (any status)
  // This filter will be used in combination with userId check in specific endpoints
  // For general listing, regular users only see published posts
  if (specificStatus === 'unpublished' || specificStatus === 'hidden') {
    // Can't filter for these - they're owner-only
    // Return a filter that won't match anything for non-owners
    return { status: { $in: [] } };
  }

  // Public sees: only published posts
  const publicStatuses = ['published'];
  if (specificStatus && publicStatuses.includes(specificStatus)) {
    return { status: specificStatus };
  }
  return { status: { $in: publicStatuses } };
};

/**
 * Check if a user can view a specific post
 * @param {Object} post - Post document
 * @param {String} userId - Current user's ID
 * @param {String} userType - Current user's type
 * @returns {Boolean} True if user can view the post
 */
const canViewPost = (post, userId, userType) => {
  const isAdmin = ['admin', 'superadmin'].includes(userType);
  const isOwner = post.userId === userId;

  switch (post.status) {
    case 'unpublished':
      // Only owner can view unpublished posts
      return isOwner;

    case 'published':
      // Everyone can view published posts
      return true;

    case 'hidden':
      // Only owner can view hidden posts
      return isOwner;

    case 'banned':
      // Admin and owner can view banned posts
      return isAdmin || isOwner;

    case 'deleted':
      // Admin and owner can view deleted posts
      return isAdmin || isOwner;

    default:
      return false;
  }
};

/**
 * Check if a user can modify a specific post
 * @param {Object} post - Post document
 * @param {String} userId - Current user's ID
 * @param {String} userType - Current user's type
 * @returns {Boolean} True if user can modify the post
 */
const canModifyPost = (post, userId, userType) => {
  const isAdmin = ['admin', 'superadmin'].includes(userType);
  const isOwner = post.userId === userId;

  // Owner can modify unpublished, published, and hidden posts
  // Only admin can modify banned and deleted posts (via different endpoints)
  if (isOwner) {
    return ['unpublished', 'published', 'hidden'].includes(post.status);
  }

  // Admins cannot modify posts (they use specific status endpoints)
  return false;
};

/**
 * Validate if a status transition is allowed
 * @param {String} currentStatus - Current post status
 * @param {String} targetStatus - Desired target status
 * @param {String} userType - Current user's type
 * @returns {Object} { allowed: boolean, reason?: string }
 */
const validateStatusTransition = (currentStatus, targetStatus, userType) => {
  const isAdmin = ['admin', 'superadmin'].includes(userType);

  // Define valid transitions for owner
  const ownerTransitions = {
    unpublished: ['published', 'deleted'],
    published: ['hidden', 'deleted'],
    hidden: ['published', 'deleted'],
    banned: ['deleted'],  // Owner can only delete banned posts
    deleted: []  // Can't transition from deleted (except admin recovery)
  };

  // Define valid transitions for admin
  const adminTransitions = {
    published: ['banned'],
    hidden: ['banned'],
    banned: ['published'],  // unban
    deleted: ['published'],  // recover
    unpublished: []  // Admin can't transition unpublished
  };

  const validTransitions = isAdmin ? adminTransitions : ownerTransitions;
  const allowedTargets = validTransitions[currentStatus] || [];

  if (allowedTargets.includes(targetStatus)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Cannot transition from ${currentStatus} to ${targetStatus}`
  };
};

module.exports = {
  buildVisibilityFilter,
  canViewPost,
  canModifyPost,
  validateStatusTransition
};
