require('dotenv').config({ path: './.env' });
console.log('FINAL MONGO_URL =', process.env.POST_DB_URL);


const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const commentsRouter = require('./src/routes/comments');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 5002;
const MONGO_URL = process.env.POST_DB_URL || process.env.MONGO_URL || 'mongodb://localhost:27017/postdb';

mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB for post-reply-service'))
  .catch(err => {
    console.error('MongoDB connection error', err.message);
    process.exit(1);
  });

app.use('/', commentsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, error: { message: err.message } });
});

app.listen(PORT, () => {
  console.log(`post-reply-service listening on port ${PORT}`);
});
