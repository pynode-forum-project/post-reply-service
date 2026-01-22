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

## Recent Changes & Database Design Notes

This project has had a set of interoperability and performance improvements. Please read these notes carefully and update deployment/configuration accordingly.

- **Unified Reply API (contract change):** The service now expects a stable reply API surface. The reply integration uses:
  - `GET /api/replies?postId={postId}` — returns replies for a post.
  - `GET /api/replies/count?postIds=id1,id2,...` — returns batch reply counts as `{ success:true, data:{ counts: { postId: number } } }`.
  The local `reply.service` in this repo calls these unified endpoints; other services should expose the same contract (or configure `REPLY_SERVICE_URL` to a compatible host).

- **Top-posts optimized:** `GET /posts/user/me/top` now uses the batch-count API to fetch reply counts in a single request instead of fetching full reply lists per post.

- **Event publishing (best-effort):** Post and reply creation now publish events to an event endpoint (HTTP POST to `HISTORY_SERVICE_URL/events` by default). Implementations may replace this with a message broker (Kafka/RabbitMQ) later. Events emitted:
  - `post.created` payload: `{ postId, userId, title, status, createdAt }`
  - `reply.created` payload: `{ replyId, postId, userId, createdAt }`
  These are best-effort (failures are logged but do not block the API request).

- **Post model API aliases:** Internally the `Post` document uses `dateCreated` / `dateModified` / `dateDeleted`. For API consistency the model now exposes `createdAt` / `updatedAt` / `deletedAt` aliases in JSON output.

- **Reply storage model (design decision):**
  - Previously the design preferred embedding replies inside the `Post` document. This implementation uses **references**: replies are stored in a separate `replies` collection (`comment.model.js`) and linked by `postId`.
  - Rationale: replies can grow unbounded and embedding causes large documents and poor performance; referencing keeps posts small and allows independent scaling and indexing of replies.
  - Implications: join-like operations require extra queries or aggregation; reply counts are computed via aggregation or maintained separately (see next note).

- **Reply count strategies:**
  - use the provided batch-count endpoint (`/api/replies/count`) to fetch counts efficiently.
  
- **Environment variables added/used:**
  - `REPLY_SERVICE_URL` — endpoint base for replies API (unchanged meaning but now expected to support `/api/replies` and `/api/replies/count`).
  - `FILE_SERVICE_URL` — file upload service base URL.
  - `HISTORY_SERVICE_URL` or `EVENT_BUS_URL` — endpoint that accepts events (default: `http://history-service:5005`).


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

## Replies API (Reply-Service contract)

The reply service provides server-side aggregation with top-level pagination and lazy-loading of children. Frontend and other services should use the canonical endpoints below.

1) Top-level (paged) replies

- Endpoint: `GET /posts/:postId/replies?topOnly=true&page=1&limit=10`
- Purpose: return top-level replies (those with `parentReplyId == null`) for the given post, paginated.
- Response (example):

```
{
  "success": true,
  "data": {
    "replies": [
      {"replyId":"r1","userId":"u1","comment":"...","createdAt":"...","replyCount":3,"hasChildren":true}
    ],
    "pagination": {"page":1,"limit":10,"total":100}
  }
}
```

Notes: include `hasChildren` or `replyCount` so the frontend can display an "expand" control without fetching children.

2) Children (lazy-loaded) replies

- Endpoint: `GET /posts/:postId/children?parentId=REPLY_ID&page=1&limit=20`
- Purpose: return direct children of a specific parent reply, paginated.
- Response: same shape as top-level but with `parentReplyId` set on each item.

3) Optional full-tree (restricted)

- Endpoint: `GET /posts/:postId/replies?tree=true&maxDepth=2`
- Purpose: return a nested reply tree assembled by the service up to `maxDepth`. Use cautiously for small threads or admin views.

Frontend responsibilities

- Use the top-level endpoint for initial rendering and call the children endpoint when the user expands a reply. Filter out replies with `isDeleted === true` or `isActive === false`.
- Show loading and retry UI for children requests; gracefully degrade if reply-service is unavailable.

Server responsibilities

- Ensure indexes on the `replies` collection (`{ postId:1, parentReplyId:1 }`).
- Enforce `maxDepth` and response size limits for tree endpoints; implement pagination for top-level and children endpoints.
- Use transactions for create/delete to keep parent `replies` arrays consistent, or provide compensating jobs if transactions are unavailable.

Document and agree on these endpoints in your API contract and update `post-service` and the frontend to consume the canonical paths above.

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
