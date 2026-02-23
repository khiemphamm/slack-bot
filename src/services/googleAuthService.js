const { google } = require('googleapis');
const env = require('../config/env');

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  // Add other necessary scopes for Docs, Sheets, etc. if needed
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate a Google OAuth URL for a specific user
 * @param {string} slackId 
 * @returns {string} The auth URL
 */
function generateAuthUrl(slackId) {
  const oAuth2Client = getOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get a refresh token
    prompt: 'consent', // Force to always get a refresh token
    scope: SCOPES,
    // Pass the slack ID in the state parameter
    state: slackId 
  });
  return authUrl;
}

/**
 * Exchange the authorization code for tokens
 * @param {string} code 
 * @returns {Promise<Object>} The tokens object containing access_token & refresh_token
 */
async function exchangeCodeForTokens(code) {
  const oAuth2Client = getOAuth2Client();
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

module.exports = {
  getOAuth2Client,
  generateAuthUrl,
  exchangeCodeForTokens
};
