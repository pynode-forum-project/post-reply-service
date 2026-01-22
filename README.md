# Post-Reply Service

A microservice for managing forum posts with support for sorting, filtering, creating, updating, and deleting posts. Includes draft management and top posts ranking by reply count.

## Overview

The Post-Reply Service is responsible for:
- Creating, reading, updating, and deleting posts
- Managing post status (published, unpublished, hidden, banned, deleted)
- Sorting posts by date (creation and modification)
- Filtering posts by creator (userId)
- Retrieving user drafts and top posts
- Integrating with reply service for reply counts
- Role-based access control (admin, user)

## Technology Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens)
- **Port:** 5002

## Project Structure

```
post-reply-service/
├── src/
│   ├── config/
│   │   └── database.js              # MongoDB connection setup
│   ├── middleware/
│   │   ├── auth.middleware.js       # JWT token validation
│   │   └── error.middleware.js      # Global error handling
│   ├── models/
│   │   └── Post.js                  # Post schema and model
│   ├── controllers/
│   │   └── post.controller.js       # Request handlers for posts
│   ├── routes/
│   │   └── post.routes.js           # API route definitions
│   ├── services/
│   │   └── reply.service.js         # Reply service integration
│   │   └── file.service.js          # File upload/storage handling
│   └── utils/
│       └── postFilters.js           # Filter and validation utilities
├── server.js                         # Express app setup
├── package.json                      # Dependencies
├── .env.example                      # Environment template
└── README.md                         # This file
```

## Installation

### Prerequisites
- Node.js v16+
- MongoDB running locally or remote connection string
- JWT_SECRET for token signing

### Setup

1. **Clone and install dependencies:**
```bash
cd post-reply-service
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
```

Edit `.env` with your settings:
```
PORT=5002
MONGODB_URI=mongodb://localhost:27017/forum_posts
JWT_SECRET=your-secret-key-here
NODE_ENV=development
FILE_SERVICE_URL=http://file-service:3000
REPLY_SERVICE_URL=http://reply-service:5001
```

3. **Start the service:**
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

All endpoints require JWT authentication (Bearer token in Authorization header).

### Posts

#### List Posts
```
GET /posts
```

**Query Parameters:**
- `page` (default: 1) - Pagination page number
- `limit` (default: 10) - Posts per page
- `sortBy` (default: 'dateCreated') - Sort field: `dateCreated` or `dateModified`
- `sortOrder` (default: 'desc') - Sort direction: `asc` or `desc`
- `userId` (optional) - Filter by creator
- `status` (optional) - Filter by status

**Response:**
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 45,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  },
  "timestamp": "2026-01-21T12:00:00Z"
}
```

#### Get Single Post
```
GET /posts/:postId
```

Returns post details with associated replies.

#### Create Post
```
POST /posts
Content-Type: multipart/form-data
```

**Fields:**
- `title` (string, required if publish=true)
- `content` (string, required if publish=true)
- `publish` (boolean, default: true) - Publish or save as draft
- `images` (file[], optional) - Image files
- `attachments` (file[], optional) - Attachment files

#### Update Post
```
PUT /posts/:postId
Content-Type: multipart/form-data
```

**Fields:**
- `title` (string, optional)
- `content` (string, optional)
- `removeImages` (string[], optional) - Image URLs to remove
- `removeAttachments` (string[], optional) - Attachment URLs to remove
- `images` (file[], optional) - New images to add
- `attachments` (file[], optional) - New attachments to add

#### Delete Post
```
DELETE /posts/:postId
```

Soft delete - sets status to 'deleted'.

#### Get User Drafts
```
GET /posts/user/me/drafts
```

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10)

#### Get User's Top Posts
```
GET /posts/user/me/top
```

Retrieves user's top 3 published posts sorted by reply count.

**Query Parameters:**
- `limit` (default: 3, max: 10)

## Database Schema

### Post Model

```javascript
{
  postId: String (UUID, unique),
  userId: String (creator's user ID),
  title: String,
  content: String,
  images: [String] (S3 URLs),
  attachments: [String] (S3 URLs),
  status: String (published, unpublished, hidden, banned, deleted),
  isArchived: Boolean (default: false),
  dateCreated: Date (immutable),
  dateModified: Date (auto-updated),
  dateDeleted: Date (optional, for soft deletes)
}
```

### Indexes
- `{ status: 1, dateCreated: -1 }` - Optimizes list queries
- `{ userId: 1, status: 1, dateCreated: -1 }` - Optimizes creator filtering
- `{ postId: 1 }` - Unique index for fast lookups

## Features

### 1. Sorting
- **By Creation Date:** Newest first (default) or oldest first
- **By Modification Date:** Most recently modified first or oldest modifications
- Configurable via `sortBy` and `sortOrder` query parameters

### 2. Filtering
- **By Status:** Published, unpublished, hidden, banned, deleted
- **By Creator:** Filter posts by specific user ID
- **Role-based:** Admins see published/banned/deleted; users see only published (except their own)

### 3. Draft Management
- Save posts as unpublished drafts
- Retrieve all personal drafts
- Edit and publish drafts later
- Differentiate drafts from published posts

### 4. File Handling
- Upload images and attachments
- Store URLs in post document
- Remove specific files from posts
- Integration with file service for S3 storage

### 5. Access Control
- **Public Users:** See only published posts
- **Post Owner:** Can edit own posts, view all own posts regardless of status
- **Admins:** Can view and moderate all posts, change status

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "timestamp": "2026-01-21T12:00:00Z"
  }
}
```

### Common Status Codes
- `200` - Success
- `201` - Created
- `400` - Validation error or invalid parameters
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (no permission)
- `404` - Not found
- `500` - Server error

## Validation Rules

### sortBy Parameter
- Must be: `dateCreated` or `dateModified`
- Returns 400 if invalid

### sortOrder Parameter
- Must be: `asc` or `desc`
- Returns 400 if invalid

### Post Title & Content
- Required for published posts
- Optional for drafts

### File Uploads
- Validated by file service
- Size limits enforced at upload time

## Performance Considerations

### Database Indexes
The service uses compound indexes to optimize common queries:
- List published posts by date: Uses `{ status: 1, dateCreated: -1 }`
- Filter by creator: Uses `{ userId: 1, status: 1, dateCreated: -1 }`

### Pagination
- Default limit: 10 posts
- Recommended limit: 5-20 posts
- Always use pagination to avoid large result sets

### Lean Queries
- Uses `.lean()` for read-only operations
- Faster query execution, lower memory usage
- Applied to list and get operations

## Integration Points

### Authentication (JWT)
- Validates tokens from auth service
- Extracts userId, userType, email from token claims
- Required for all endpoints

### Reply Service Integration
- Fetches reply count for top posts endpoint
- Validates post existence before recording views (history service)
- Timeout: 5 seconds with graceful degradation

### File Service Integration
- Uploads images and attachments
- Manages file deletion
- Returns S3 URLs for storage

## Deployment

### Docker
```bash
docker build -t post-reply-service .
docker run -p 5002:5002 --env-file .env post-reply-service
```

### Environment Variables
- `PORT` - Service port (default: 5002)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT validation
- `NODE_ENV` - Environment (development/production)
- `FILE_SERVICE_URL` - File service URL
- `REPLY_SERVICE_URL` - Reply service URL

## Testing

Run tests:
```bash
npm test
```

Test coverage:
```bash
npm run test:coverage
```

## Debugging

Enable debug logging:
```bash
DEBUG=post-reply-service:* npm start
```

## Troubleshooting

### "Invalid sortBy" Error
- Check allowed values: `dateCreated`, `dateModified`
- Case-sensitive

### "Invalid sortOrder" Error
- Check allowed values: `asc`, `desc`
- Case-sensitive

### Posts not appearing
- Check user's role and post status
- Admins see: published, banned, deleted
- Users see: published (only)

### File upload fails
- Check file service availability
- Verify file size limits
- Check S3 bucket permissions

## API Usage Examples

### Frontend Integration

```javascript
// Get newest posts
const response = await fetch('/api/posts?page=1&limit=10', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});

// Get oldest posts
const response = await fetch('/api/posts?sortOrder=asc', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});

// Get user's posts
const response = await fetch('/api/posts?userId=user-123&sortOrder=asc', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});

// Create published post with file
const formData = new FormData();
formData.append('title', 'My Post');
formData.append('content', 'Content here');
formData.append('publish', true);
formData.append('images', imageFile);

const response = await fetch('/api/posts', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

// Get user's drafts
const response = await fetch('/api/posts/user/me/drafts?page=1', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});

// Get top 3 posts by replies
const response = await fetch('/api/posts/user/me/top?limit=3', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Future Enhancements

- [ ] Full-text search capability
- [ ] Post categories/tags
- [ ] Pinned posts
- [ ] Post scheduling (publish at specific time)
- [ ] Revision history for posts
- [ ] Batch operations (delete multiple posts)
- [ ] Advanced filtering (date range, keyword search)
- [ ] Post analytics (view count, reply count trends)

## Support

For issues or questions:
1. Check the API documentation: `/frontend/src/docs/auth-api-contract.md`
2. Review error messages and status codes
3. Verify environment configuration
4. Check service logs: `npm start` and look for error output

## License

Private project - Do not distribute
