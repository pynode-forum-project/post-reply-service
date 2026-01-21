# post-reply-service — FP30 Reply/Comment API

This document describes the service implemented for FP30: Reply/Comment API. It summarizes the endpoints, data schema, environment variables, behavior assumptions and examples to help the database and post-service designers integrate with this service.

---

## Purpose

- Handle creation, nesting and soft-deletion of replies/comments for posts.
- Store replies in an independent MongoDB collection and relate replies to posts via `postId`.

## Key decisions / default assumptions (adopted)

- Storage: independent `replies` collection (not embedded in `posts`).
- IDs: `replyId` is a UUID (v4). `postId` and `userId` are treated as UUID strings (from other services).
- Auth: JWT (HS256) required. Service reads `userId` from token payload. Env var `JWT_SECRET_KEY` must be set.
- Nesting: nested replies are allowed. Each reply may have an optional `parentReplyId` pointing to another reply.
- Deletion: soft-delete. When a reply is deleted it is marked rather than removed (`isDeleted=true`). Visible `comment` is replaced with a placeholder (`[deleted]`) by default.
- Redundant user fields: requests may include `userFirstName`, `userLastName`, `userProfileImageURL` as display snapshots. Caller may instead populate these from `user-service` if preferred.

---

## Environment variables

- `POST_DB_URL` or `MONGO_URL` — MongoDB connection string. Default: `mongodb://localhost:27017/postdb`.
- `JWT_SECRET_KEY` — HS256 secret to verify tokens. Required.
- `POST_SERVICE_URL` — Base URL for the Post service used when verifying post ownership. Default: `http://post-service:5002`.

---

## Endpoints

1) Create reply/comment

- Method: `POST`
- Path (service): `/:id/comments`  (gateway forwards `/api/posts/:id/comments` to this service)
- Auth: required (Bearer JWT)
- Request body (JSON):

```json
{
  "comment": "string",                // required
  "parentReplyId": null | "string",   // optional
  "images": ["url"],                  // optional
  "attachments": ["url"],             // optional
  "userFirstName": "string",          // optional snapshot
  "userLastName": "string",
  "userProfileImageURL": "string"
}
```

- Responses:
  - `201 Created` — returns created reply object.
  - `400` — bad request (missing comment, invalid payload).
  - `401` — unauthorized (missing/invalid JWT).

2) Soft-delete reply

- Method: `DELETE`
- Path (service): `/:postId/comments/:replyId`
- Auth: required (Bearer JWT)
- Authorization rule: allowed if requester is the reply author OR the owner of the post. The service will call the Post service (via `POST_SERVICE_URL`) to determine post owner.
- Behavior: marks reply with `isDeleted=true`, sets `deletedAt`, `deletedBy` and `isActive=false`, and replaces `comment` with `[deleted]` (default behavior).
- Responses: `200` on success (returns updated object), `403` if not permitted, `404` if reply not found.

---

## Data schema (Mongo collection `replies`)

Example document (Mongoose model implemented at `src/models/comment.model.js`):

```json
{
  "_id": "ObjectId(...)",
  "replyId": "uuid-v4",
  "userId": "uuid-of-user",
  "postId": "uuid-of-post",
  "parentReplyId": null | "uuid-of-parent-reply",
  "comment": "string or '[deleted]'",
  "originalComment": null, // optional 
  "images": ["url"],
  "attachments": ["url"],
  "isActive": true,
  "isDeleted": false,
  "deletedAt": null,
  "deletedBy": null,
  "userFirstName": "string",
  "userLastName": "string",
  "userProfileImageURL": "string",
  "replies": ["childReplyId", ...],
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

Field notes:
- `replies` stores child `replyId`s (simple adjacency list) for quick traversal.
- `parentReplyId` and `replies` together allow constructing a reply tree.

Indexes recommended:
- `postId` (for listing replies by post)
- `replyId` (unique/indexed)
- `userId` (for user-specific queries)
- Composite index `{ postId:1, createdAt:-1 }` for paginated retrieval.

---

## Ownership check (delete permission)

To determine whether the requester is the post owner, the service will attempt a GET to `POST_SERVICE_URL/api/posts/:postId` and inspect common response shapes for the owner field (e.g. `data.userId`, `data.ownerId`, etc.). If your Post service uses a specific shape (for example `{ data: { post: { id, authorId }}}`), please let us know so we can make the owner resolution deterministic.

If the Post service cannot be reached, the delete operation will only succeed for the reply author (post-owner check will be skipped and treated as not allowed).

---

## Nested replies behavior

- Creating a reply with `parentReplyId` will save the `parentReplyId` on the new reply and attempt to push the new `replyId` into the parent's `replies` array.
- There is currently no enforced maximum nesting depth. If you want a maximum depth (recommended value: 3), the `create` endpoint can be updated to validate depth by walking parent chain.
- Deleting a parent reply performs a soft-delete on that reply only; children remain and continue to reference the (now deleted) parent. Alternatives (choose one): cascade soft-delete children, or promote children to top-level (clear `parentReplyId`).

---

## Examples

Start service (local):
```powershell
cd post-reply-service
npm install
$env:JWT_SECRET_KEY="your_jwt_secret"
$env:POST_DB_URL="mongodb://localhost:27017/postdb"
node server.js
```

Create reply (curl / WSL):
```bash
curl -X POST "http://localhost:5002/POST_UUID/comments" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"comment":"hi","images":[],"parentReplyId":null}'
```

Delete reply (curl):
```bash
curl -X DELETE "http://localhost:5002/POST_UUID/comments/REPLY_UUID" \
  -H "Authorization: Bearer <JWT>"
```

Postman: import requests above; set `Authorization` header and JSON body.

---

## Integration notes for Post / DB designers

- Confirm the stable Post service endpoint and JSON shape so the ownership check is deterministic.
- Decide how the Post service and reply service should keep `commentCount` in sync (event-driven increment via messaging, or Post service queries replies count when needed).
- Decide the maximum nesting depth policy and whether to cascade deletes or not.

---

## TODO 

- Add robust input validation (max comment length, allowed HTML/Markdown, media count limits).
- Add integration tests and a Postman collection for CI/manual testing.
- Add pagination endpoints for listing replies per post (top-level + per-thread fetch).
- Consider moving user snapshot fill to `user-service` to avoid trusting clients.

