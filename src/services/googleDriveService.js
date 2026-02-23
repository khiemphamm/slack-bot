const { google } = require('googleapis');
const { getOAuth2Client } = require('./googleAuthService');

/**
 * Perform a keyword search on Google Drive for a user
 * @param {string} refreshToken User's refresh token from DB
 * @param {string} query The search query string
 * @returns {Promise<Array>} Array of matching files
 */
async function searchFiles(refreshToken, query) {
  const oAuth2Client = getOAuth2Client();
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

  // Escape single quotes for drive query
  const safeQuery = query.replace(/'/g, "\\'");

  // Focus on Document types, Folders, and generic names matching query
  const driveQuery = `
    trashed = false and 
    name contains '${safeQuery}' and 
    (
      mimeType = 'application/vnd.google-apps.document' or 
      mimeType = 'application/vnd.google-apps.spreadsheet' or 
      mimeType = 'application/vnd.google-apps.presentation' or 
      mimeType = 'application/vnd.google-apps.folder' or 
      mimeType = 'application/pdf'
    )
  `.trim();

  const response = await drive.files.list({
    q: driveQuery,
    fields: 'nextPageToken, files(id, name, mimeType, webViewLink, iconLink, modifiedTime, owners)',
    spaces: 'drive',
    pageSize: 10,
    orderBy: 'modifiedTime desc',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: 'allDrives'
  });

  return response.data.files;
}

module.exports = {
  searchFiles
};
