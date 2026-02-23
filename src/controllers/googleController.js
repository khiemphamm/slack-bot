const db = require('../database/db');
const googleAuthService = require('../services/googleAuthService');
const googleDriveService = require('../services/googleDriveService');
const slackBlocks = require('../utils/slackBlocks');

/**
 * Handle the /doc slash command for Google Drive
 */
async function handleDocSearchCommand({ command, ack, respond }) {
  await ack();

  const slackId = command.user_id;
  const query = command.text.trim();

  try {
    // 1. Check if the user has connected their Google account
    const refreshToken = await db.getGoogleRefreshToken(slackId);

    if (!refreshToken) {
      // User is not authenticated. Generate Auth URL and prompt them
      const authUrl = googleAuthService.generateAuthUrl(slackId);
      const blocks = slackBlocks.buildLoginPromptBlocks(authUrl);

      return await respond({
        blocks: blocks,
        text: 'Please connect your Google Account to search documents.'
      });
    }

    if (!query) {
      return await respond({
        text: 'Please provide a search term. Example: `/doc Q1 Marketing Plan`'
      });
    }

    // 2. Acknowledge search initiation
    await respond({
      text: `🔍 Searching Google Drive for \`"${query}"\`...`
    });

    // 3. Perform the search
    try {
      const files = await googleDriveService.searchFiles(refreshToken, query);
      const resultBlocks = slackBlocks.buildDriveSearchResultsBlocks(files, query);

      // Return the final UI blocks
      await respond({
        blocks: resultBlocks,
        text: `Results for ${query}`
      });

    } catch (apiError) {
      console.error(`Google API Error for user ${slackId}:`, apiError.message);
      
      // If the error suggests token revoked / invalid, ask them to re-authenticate
      if (apiError.response && (apiError.response.status === 400 || apiError.response.status === 401 || apiError.response.status === 403)) {
        const authUrl = googleAuthService.generateAuthUrl(slackId);
        const blocks = slackBlocks.buildLoginPromptBlocks(authUrl);
        await respond({
          blocks: blocks,
          text: 'Your Google connection has expired or is invalid. Please reconnect.'
        });
      } else {
        await respond({
          text: `❌ An error occurred while searching Google Drive: ${apiError.message}`
        });
      }
    }

  } catch (error) {
    console.error('Error handling /doc command:', error.message);
    await respond({
      text: `❌ An unexpected error occurred: ${error.message}`
    });
  }
}

module.exports = {
  handleDocSearchCommand
};
