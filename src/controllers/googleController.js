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

/**
 * Handle the /docs-list slash command to show recent Google Drive documents
 */
async function handleDocsListCommand({ command, ack, respond }) {
  await ack();

  const slackId = command.user_id;

  // Parse the limit from command text, default to 5, max 50
  let limit = 5;
  const rawText = command.text.trim();
  if (rawText) {
    const parsed = parseInt(rawText, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 50);
    }
  }

  try {
    // 1. Check if the user has connected their Google account
    const refreshToken = await db.getGoogleRefreshToken(slackId);

    if (!refreshToken) {
      // User is not authenticated. Generate Auth URL and prompt them
      const authUrl = googleAuthService.generateAuthUrl(slackId);
      const blocks = slackBlocks.buildLoginPromptBlocks(authUrl);

      return await respond({
        blocks: blocks,
        text: 'Please connect your Google Account to view recent documents.'
      });
    }

    // 2. Acknowledge search initiation
    await respond({
      text: `⏳ Fetching your latest ${limit} Google Drive documents...`
    });

    // 3. Perform the fetch
    try {
      const files = await googleDriveService.listRecentFiles(refreshToken, limit);
      const resultBlocks = slackBlocks.buildRecentFilesBlocks(files, limit);

      // Return the final UI blocks
      await respond({
        blocks: resultBlocks,
        text: `Recent ${limit} Documents`
      });

    } catch (apiError) {
      console.error(`Google API Error for user ${slackId} on /docs-list:`, apiError.message);
      
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
          text: `❌ An error occurred while fetching your documents: ${apiError.message}`
        });
      }
    }

  } catch (error) {
    console.error('Error handling /docs-list command:', error.message);
    await respond({
      text: `❌ An unexpected error occurred: ${error.message}`
    });
  }
}

module.exports = {
  handleDocSearchCommand,
  handleDocsListCommand
};
