const postController = require('../postController');
const { validationResult } = require('express-validator');
const Post = require('../../models/Post');
const Reply = require('../../models/Reply');
const userClient = require('../../services/userClient');

// Post mock: constructor + static methods
jest.mock('../../models/Post', () => {
  const ctor = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
    this.toJSON = () => Object.assign({}, this, { postId: 'fake-post-id' });
  });
  // Attach default static methods (will be overridden in tests)
  ctor.findById = jest.fn().mockResolvedValue(null);
  // Provide chainable query-like behavior for find()
  ctor.__findResult = [];
  const buildQuery = () => {
    const q = {};
    q.sort = jest.fn().mockImplementation(() => q);
    q.skip = jest.fn().mockImplementation(() => q);
    q.limit = jest.fn().mockImplementation(() => Promise.resolve(ctor.__findResult));
    q.then = (resolve, reject) => resolve(ctor.__findResult);
    return q;
  };
  ctor.find = jest.fn().mockImplementation(() => buildQuery());
  ctor.countDocuments = jest.fn().mockResolvedValue(0);
  ctor.aggregate = jest.fn().mockResolvedValue([]);
  return ctor;
});

jest.mock('../../models/Reply', () => ({
  find: jest.fn().mockResolvedValue([])
}));

jest.mock('../../services/userClient', () => ({
  getUserById: jest.fn().mockResolvedValue(null)
}));

jest.mock('express-validator', () => ({
  validationResult: jest.fn()
}));

describe('postController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPost', () => {
    test('returns 400 when validation errors exist', async () => {
      validationResult.mockReturnValue({ isEmpty: () => false, array: () => [{ msg: 'invalid' }] });

      const req = { headers: {}, body: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.createPost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: 'invalid' }] });
    });

    test('creates a post and returns 201 with post data', async () => {
      validationResult.mockReturnValue({ isEmpty: () => true });

      const req = {
        headers: { 'x-user-id': '42' },
        body: { title: 'Hello', content: 'World', status: 'published', images: [], attachments: [] }
      };

      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.createPost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Post created successfully', post: expect.any(Object) }));

      // Ensure Post constructor was called with provided data
      expect(Post).toHaveBeenCalledWith(expect.objectContaining({ userId: 42, title: 'Hello', content: 'World' }));
    });
  });

  describe('getPostById', () => {
    test('returns 404 when post not found', async () => {
      Post.findById.mockResolvedValue(null);

      const req = { params: { id: '1' }, headers: { 'x-user-id': '1', 'x-user-type': '' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.getPostById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Post not found' });
    });

    test('returns 403 for unpublished post when not owner', async () => {
      const post = { userId: 1, status: 'unpublished' };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: '1' }, headers: { 'x-user-id': '2', 'x-user-type': '' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.getPostById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
    });

    test('returns published post with user and replyCount', async () => {
      const id = 'abc';
      const post = {
        _id: id,
        userId: 99,
        status: 'published',
        toJSON: () => ({ postId: id, title: 'T', content: 'C' })
      };
      Post.findById.mockResolvedValue(post);
      Reply.find.mockResolvedValue([{ isActive: true, replies: [{ isActive: true, replies: [] }] }]);
      userClient.getUserById.mockResolvedValue({ user_id: 99, first_name: 'A', last_name: 'B', profile_image_url: 'url' });

      const req = { params: { id }, headers: { 'x-user-id': '0', 'x-user-type': '' } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await postController.getPostById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ post: expect.objectContaining({ replyCount: 2, user: expect.any(Object) }) }));
    });

    test('hidden post returns 403 when not owner', async () => {
      const post = { userId: 9, status: 'hidden' };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'h' }, headers: { 'x-user-id': '1', 'x-user-type': '' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.getPostById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'This post is hidden' });
    });

    test('banned post returns 403 when neither owner nor admin', async () => {
      const post = { userId: 10, status: 'banned' };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'b' }, headers: { 'x-user-id': '1', 'x-user-type': '' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.getPostById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'This post has been banned' });
    });

    test('deleted post returns 404 when neither owner nor admin', async () => {
      const post = { userId: 11, status: 'deleted' };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'd' }, headers: { 'x-user-id': '1', 'x-user-type': '' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.getPostById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Post not found' });
    });

    test('admin can view banned post', async () => {
      const id = 'adm';
      const post = {
        _id: id,
        userId: 50,
        status: 'banned',
        toJSON: () => ({ postId: id })
      };
      Post.findById.mockResolvedValue(post);
      Reply.find.mockResolvedValue([]);
      userClient.getUserById.mockResolvedValue(null);

      const req = { params: { id }, headers: { 'x-user-id': '1', 'x-user-type': 'admin' } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await postController.getPostById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ post: expect.any(Object) }));
    });
  });

  describe('banned/deleted/list endpoints & update actions', () => {
    test('getBannedPosts returns list', async () => {
      Post.__findResult = [{ title: 'b' }];
      Post.countDocuments.mockResolvedValue(1);

      const req = { query: {} };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await postController.getBannedPosts(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ posts: expect.any(Array), total: 1 }));
    });

    test('getDeletedPosts returns list', async () => {
      Post.__findResult = [{ title: 'del' }];
      Post.countDocuments.mockResolvedValue(1);

      const req = { query: {} };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await postController.getDeletedPosts(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ posts: expect.any(Array), total: 1 }));
    });

    test('getUserTopPosts returns posts', async () => {
      Post.__findResult = [{ title: 'top' }];

      const req = { params: { userId: '7' }, query: {} };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await postController.getUserTopPosts(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ posts: expect.any(Array) });
    });

    test('updatePost: not owner returns 403', async () => {
      const post = { userId: 20, status: 'published' };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'u1' }, headers: { 'x-user-id': '1' }, body: { title: 'x' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.updatePost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('updatePost: cannot update banned', async () => {
      const post = { userId: 2, status: 'banned' };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'u2' }, headers: { 'x-user-id': '2' }, body: { title: 'x' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.updatePost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('updatePost: success updates and returns post', async () => {
      const post = { userId: 3, status: 'published', save: jest.fn(), toJSON: () => ({ title: 'after' }) };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'u3' }, headers: { 'x-user-id': '3' }, body: { title: 'new' } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await postController.updatePost(req, res, next);

      expect(post.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Post updated successfully', post: expect.any(Object) }));
    });

    test('ban/unban/recover flows', async () => {
      // banPost: must be published
      let post = { status: 'published', save: jest.fn(), toJSON: () => ({}) };
      Post.findById.mockResolvedValue(post);
      let req = { params: { id: 'b1' } };
      let res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      let next = jest.fn();

      await postController.banPost(req, res, next);
      expect(post.save).toHaveBeenCalled();

      // unbanPost: require status 'banned'
      post = { status: 'banned', save: jest.fn(), toJSON: () => ({}) };
      Post.findById.mockResolvedValue(post);
      req = { params: { id: 'u1' } };
      res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await postController.unbanPost(req, res, next);
      expect(post.save).toHaveBeenCalled();

      // recoverPost: require status 'deleted'
      post = { status: 'deleted', save: jest.fn(), toJSON: () => ({}) };
      Post.findById.mockResolvedValue(post);
      req = { params: { id: 'r1' } };
      res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await postController.recoverPost(req, res, next);
      expect(post.save).toHaveBeenCalled();
    });
  });

  describe('getUserDrafts', () => {
    test('returns user drafts', async () => {
      const posts = [{ title: 'd1' }];
      Post.__findResult = posts;

      const req = { headers: { 'x-user-id': '5' } };
      const res = { json: jest.fn() };
      const next = jest.fn((err) => { if (err) console.error('DEBUG next error:', err && err.stack ? err.stack : err); });

      await postController.getUserDrafts(req, res, next);

      expect(Post.find).toHaveBeenCalledWith({ userId: 5, status: 'unpublished' });
      expect(res.json).toHaveBeenCalledWith({ posts });
    });
  });

  describe('getPublishedPosts', () => {
    test('returns published posts (simple path)', async () => {
      const postObj = { _id: 'p1', userId: 7, toJSON: () => ({ postId: 'p1' }) };
      Post.__findResult = [postObj];
      Post.countDocuments.mockResolvedValue(1);
      Reply.find.mockResolvedValue([]);
      userClient.getUserById.mockResolvedValue(null);

      const req = { query: {}, headers: {} };
      const res = { json: jest.fn() };
      const next = jest.fn((err) => { if (err) console.error('DEBUG next error:', err && err.stack ? err.stack : err); });

      await postController.getPublishedPosts(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ posts: expect.any(Array), total: 1 }));
    });

    test('aggregation path when sorting by replyCount', async () => {
      // Use a valid 24-char hex string for ObjectId
      const aggId = '507f1f77bcf86cd799439011';
      Post.aggregate.mockResolvedValue([{ _id: aggId, actualReplyCount: 5, dateCreated: new Date() }]);
      Post.countDocuments.mockResolvedValue(1);
      Post.__findResult = [];
      userClient.getUserById.mockResolvedValue(null);

      const req = { query: { sortBy: 'replyCount' }, headers: {} };
      const res = { json: jest.fn() };
      const next = jest.fn((err) => { if (err) console.error('DEBUG next error:', err && err.stack ? err.stack : err); });

      await postController.getPublishedPosts(req, res, next);

      expect(Post.aggregate).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ posts: expect.any(Array), total: 1 }));
    });
  });

  describe('updatePostStatus, deletePost, toggleArchive', () => {
    test('updatePostStatus returns 404 when not found', async () => {
      Post.findById.mockResolvedValue(null);

      const req = { params: { id: 'x' }, headers: { 'x-user-id': '1' }, body: { status: 'published' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.updatePostStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('updatePostStatus invalid status', async () => {
      const post = { userId: 1, status: 'unpublished', save: jest.fn() };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'x' }, headers: { 'x-user-id': '1' }, body: { status: 'invalid' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await postController.updatePostStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('deletePost success', async () => {
      const post = { userId: 3, save: jest.fn(), status: 'published' };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'y' }, headers: { 'x-user-id': '3' } };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();

      await postController.deletePost(req, res, next);

      expect(post.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Post deleted' });
    });

    test('toggleArchive toggles and saves', async () => {
      const post = { userId: 4, isArchived: false, save: jest.fn(), toJSON: () => ({}) };
      Post.findById.mockResolvedValue(post);

      const req = { params: { id: 'z' }, headers: { 'x-user-id': '4' } };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();

      await postController.toggleArchive(req, res, next);

      expect(post.isArchived).toBe(true);
      expect(post.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Post archived' }));
    });
  });
});
