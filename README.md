# Post Service

Express.js + MongoDB microservice for managing forum posts with file upload capabilities.

## Features

- **CRUD Operations**: Create, Read, Update, and Delete posts
- **File Uploads**: Support for images and attachments via file-service integration
- **Pagination**: Offset-based pagination for post listings
- **Reply Integration**: Automatically fetches replies from reply-service
- **Authentication**: JWT-based authentication on all endpoints
- **Authorization**: Owner/admin-only access for updates and deletions
- **Soft Delete**: Posts are archived instead of permanently deleted

## Technology Stack

- **Express.js**: Web framework
- **MongoDB**: Database with Mongoose ODM
- **Multer**: File upload handling
- **JWT**: Authentication
- **Axios**: HTTP client for microservice communication

## API Endpoints

### GET /posts
List posts with pagination.

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### GET /posts/:id
Get single post with replies.

**Response:**
```json
{
  "success": true,
  "data": {
    "postId": "uuid",
    "userId": "user-uuid",
    "title": "Post title",
    "content": "Post content",
    "images": ["url1"],
    "attachments": ["url2"],
    "replies": [...]
  }
}
```

### POST /posts
Create a new post with optional file uploads.

**Content-Type:** `multipart/form-data`

**Fields:**
- `title` (required): Post title
- `content` (required): Post content
- `images` (optional): Image files (max 5)
- `attachments` (optional): Attachment files (max 5)

**Response:** 201 Created

### PUT /posts/:id
Update an existing post (owner or admin only).

**Content-Type:** `multipart/form-data`

**Fields:**
- `title` (optional)
- `content` (optional)
- `images` (optional): New image files
- `attachments` (optional): New attachment files
- `removeImages` (optional): Array of image URLs to remove
- `removeAttachments` (optional): Array of attachment URLs to remove

**Response:** 200 OK

### DELETE /posts/:id
Archive a post (owner or admin only).

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Post archived successfully",
    "postId": "uuid"
  }
}
```

### PATCH /posts/:id/archive
Archive a post (admin only). Allows admins to archive any post regardless of ownership.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Post archived by admin",
    "postId": "uuid"
  }
}
```

### PATCH /posts/:id/unarchive
Unarchive a previously archived post (admin only). Restores the post to normal visibility.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Post unarchived by admin",
    "postId": "uuid"
  }
}
```

## Environment Variables

```bash
PORT=5002
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/forum_posts
JWT_SECRET=your-secret-key
REPLY_SERVICE_URL=http://localhost:5003
FILE_SERVICE_URL=http://localhost:5004
MAX_FILE_SIZE=10485760
```

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Docker

```bash
# Build image
docker build -t post-service .

# Run container
docker run -p 5002:5002 --env-file .env post-service
```

## File Upload Flow

1. Frontend sends multipart form data to POST /posts
2. Multer middleware processes files
3. Files are uploaded to file-service with naming: `post:{postId}-{datetime}-{filename}`
4. File-service returns URLs
5. Post is saved to MongoDB with file URLs

## Authentication

All endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

The JWT token must contain:
- `userId`: User identifier
- `userType`: User role (visitor, normal_user, admin, superadmin)

## Business Rules

- Non-admin users cannot see archived posts
- Only post owners and admins can update/delete posts
- File uploads are limited to 10MB per file
- Maximum 5 images and 5 attachments per post
- Posts are soft-deleted (archived) not permanently removed

## Integration with Other Services

- **File Service**: Handles file storage and retrieval
- **Reply Service**: Provides replies for posts (graceful degradation if unavailable)
- **Auth Service**: Validates JWT tokens
- **Gateway**: Routes all requests through `/api/posts`

## Error Handling

Standard error response format:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "timestamp": "2026-01-21T..."
  }
}
```

## Health Check

```bash
GET /health
```

Returns service status and configuration.