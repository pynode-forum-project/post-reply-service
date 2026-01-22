const axios = require('axios');
const FormData = require('form-data');

const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL || 'http://localhost:5004';
const REQUEST_TIMEOUT = 10000; // 10 seconds for file uploads

/**
 * Upload files to the file service
 * @param {Array} files - Array of file objects from multer
 * @param {String} postId - Post ID for naming convention
 * @param {String} fileType - 'image' or 'attachment'
 * @returns {Promise<Array>} Array of file URLs
 */
const uploadFiles = async (files, postId, fileType = 'attachment') => {
  if (!files || files.length === 0) {
    return [];
  }

  try {
    const uploadedUrls = [];

    for (const file of files) {
      const formData = new FormData();

      // Create filename with naming convention: post:{postId}-{datetime}-{originalname}
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `post:${postId}-${timestamp}-${file.originalname}`;

      // Append file buffer to form data
      formData.append('file', file.buffer, {
        filename: filename,
        contentType: file.mimetype
      });

      formData.append('fileType', fileType);
      formData.append('postId', postId);

      // Upload to file service
      const response = await axios.post(`${FILE_SERVICE_URL}/upload`, formData, {
        headers: {
          ...formData.getHeaders()
        },
        timeout: REQUEST_TIMEOUT
      });

      // Extract URL from response
      if (response.data && response.data.success) {
        const fileUrl = response.data.data.url || response.data.data.fileUrl;
        if (fileUrl) {
          uploadedUrls.push(fileUrl);
        }
      }
    }

    return uploadedUrls;
  } catch (error) {
    console.error('File upload to file-service failed:', error.message);

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('File service is unavailable');
      throw new Error('File service is currently unavailable. Please try again later.');
    }

    if (error.response) {
      console.error('File service error response:', error.response.data);
      throw new Error(error.response.data.error?.message || 'Failed to upload files');
    }

    throw new Error('Failed to upload files to file service');
  }
};

/**
 * Delete files from the file service
 * @param {Array} fileUrls - Array of file URLs to delete
 * @returns {Promise<void>}
 */
const deleteFiles = async (fileUrls) => {
  if (!fileUrls || fileUrls.length === 0) {
    return;
  }

  try {
    for (const url of fileUrls) {
      try {
        await axios.delete(`${FILE_SERVICE_URL}/delete`, {
          data: { url },
          timeout: REQUEST_TIMEOUT
        });
      } catch (err) {
        // Log but don't fail - file deletion is not critical
        console.warn(`Failed to delete file ${url}:`, err.message);
      }
    }
  } catch (error) {
    // Graceful degradation - log error but don't throw
    console.error('Error during file deletion:', error.message);
  }
};

module.exports = {
  uploadFiles,
  deleteFiles
};