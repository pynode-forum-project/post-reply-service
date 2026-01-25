# Post & Reply Service

Overview
- This microservice manages posts and replies (including nested replies) for the ForumProject.
- Built with Express + Mongoose; expects to run behind a gateway that provides authentication headers.

**Architecture**
- **Entry**: `src/index.js` — Express app, connects to MongoDB, registers middleware and routes.
- **Routes**: `src/routes/postRoutes.js`, `src/routes/replyRoutes.js` — REST endpoints for posts and replies.
- **Controllers**: `src/controllers/postController.js`, `src/controllers/replyController.js` — business logic, pagination, nested-reply handling.
- **Models**: `src/models/Post.js`, `src/models/Reply.js` — Mongoose schemas. `Reply` supports nested `replies` arrays.
- **Service clients**: `src/services/userClient.js` — fetches user info from User Service with a small in-memory cache.
- **Middleware & utils**: `src/middleware/validators.js`, `src/middleware/errorHandler.js`, `src/utils/logger.js`.

**Key behaviors & design notes**
- Reply nesting: replies are stored as embedded sub-documents in the `Reply` document (`replies` array). Controllers use recursive logic to traverse, count, add, or soft-delete nested replies.
- Reply counts: `Post.replyCount` is maintained for quick queries, but controllers also compute accurate counts (including nested replies) where necessary (aggregation or recursive counting).
- Soft delete: posts and replies are soft-deleted via `status` (for posts) or `isActive` (for replies) to allow recovery and auditing.
- Auth & authorization: this service trusts `x-user-id` and `x-user-type` headers provided by an upstream gateway; it enforces resource-level permissions (owner / post owner / admin) for sensitive operations.
- Resilience: `userClient` calls user service with a 5s timeout and caches responses for 5 minutes to reduce latency.

**Environment variables**
- `PORT` — port to run the service (default: `5002`).
- `MONGODB_URI` — MongoDB connection string (default: `mongodb://localhost:27017/post_db`).
- `USER_SERVICE_URL` — base URL for the user service used by `userClient` (default: `http://localhost:5001`).
- `NODE_ENV`, `LOG_LEVEL` — runtime and logging controls.

**Install & Run**
1. Install dependencies:

```bash
npm install
```

2. Start (development):

```bash
npm run dev
```

3. Start (production):

```bash
npm start
```

Health check
- GET /health

Examples (selected endpoints)
- Get published posts (paginated):

```bash
curl 'http://localhost:5002/posts?page=1&limit=20'
```

- Create a post (gateway should supply `x-user-id` header):

```bash
curl -X POST http://localhost:5002/posts \
  -H "Content-Type: application/json" \
  -H "x-user-id: 123" \
  -d '{"title":"Hello","content":"World","status":"published"}'
```

- Get replies for a post:

```bash
curl http://localhost:5002/replies/post/<POST_ID>
```

- Create a reply:

```bash
curl -X POST http://localhost:5002/replies/post/<POST_ID> \
  -H "Content-Type: application/json" \
  -H "x-user-id: 123" \
  -d '{"comment":"Nice post!"}'
```

**Logging & errors**
- Uses `winston` to write `logs/error.log` and `logs/combined.log`; console logging enabled in non-production.
- Errors are handled by `src/middleware/errorHandler.js` which maps Mongoose and HTTP errors to consistent responses.

**Testing**
- `npm test` runs Jest tests (if present).

**Operational notes / caveats**
- Because nested replies are stored inside `Reply` documents, very deep or very large reply trees may produce large documents — consider migrating to a referenced model if reply volume per post grows very large.
- The service assumes an upstream gateway enforces authentication; it performs authorization checks using headers only.

**Where to look in code**
- Entry point: `src/index.js`
- Posts logic: `src/controllers/postController.js`
- Replies & nested logic: `src/controllers/replyController.js`
- Models: `src/models/Post.js`, `src/models/Reply.js`
- External user lookup: `src/services/userClient.js`

License
- See repository license at the project root.
