const { App } = require('@slack/bolt');
const env = require('./config/env');
const jiraController = require('./controllers/jiraController');
const adminController = require('./controllers/adminController');
const googleController = require('./controllers/googleController');
const { requireAdmin } = require('./middlewares/authMiddleware');
const googleAuthService = require('./services/googleAuthService');
const db = require('./database/db');
const express = require('express');


// Initializes your app with your bot token and signing secret
const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  socketMode: true, // Recommended for local dev and behind corporate firewalls
  appToken: env.SLACK_APP_TOKEN,
  port: env.PORT
});

// A simple message listener for verification
app.message('hello', async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say(`Hey there <@${message.user}>! I'm alive and ready to help with Jira & Workspace.`);
});

// Register slash command listener
app.command('/jira', jiraController.handleJiraCommand);
app.command('/jira-map', jiraController.handleJiraMapCommand);
app.command('/jira-tasks', jiraController.handleJiraTasksCommand); // Permissions checked inside controller

// Google Workspace slash command
app.command('/doc', googleController.handleDocSearchCommand);
app.command('/docs', googleController.handleDocSearchCommand); // Alias for plural form
app.command('/docs-list', googleController.handleDocsListCommand);

// Secure slash command listeners (Admin Only)
app.command('/jira-report', requireAdmin, jiraController.handleJiraReportCommand);
app.command('/jira-team', requireAdmin, jiraController.handleJiraTeamCommand);
app.command('/jira-projects', requireAdmin, jiraController.handleJiraProjectsCommand);
app.command('/jira-grant-admin', requireAdmin, adminController.handleGrantAdminCommand);

// Register button click listener pattern (matches action_id starting with 'transition_')
app.action(/^transition_/, jiraController.handleTransitionAction);

// Acknowledge the 'View in Jira' button click to prevent timeout warnings in Slack
app.action('view_jira_issue', async ({ ack }) => {
  await ack();
});

// Advanced Interactivity Actions
app.action('open_comment_modal', jiraController.handleOpenCommentModal);
app.action('assign_issue', jiraController.handleAssignIssueAction);
app.view('comment_modal_submission', jiraController.handleCommentSubmit);

// Global Message Listener for Jira Links (Link Unfurling Alternative)
app.message(/atlassian\.net\/(?:browse\/|.*[?&]selectedIssue=)([A-Za-z0-9]+-\d+)/i, jiraController.handleJiraLinkRegex);

// ==========================================
// Custom Express Routes (Google OAuth)
// ==========================================
const expressApp = express();

expressApp.get('/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const slackId = req.query.state; // We passed slackId as state

    if (!code || !slackId) {
      return res.status(400).send('Missing authorization code or state (Slack ID).');
    }

    // Exchange the code for tokens
    const tokens = await googleAuthService.exchangeCodeForTokens(code);

    // Save refresh token to DB
    if (tokens.refresh_token) {
      await db.saveGoogleRefreshToken(slackId, tokens.refresh_token);
    }

    // Send a DM to the user in Slack
    try {
      await app.client.chat.postMessage({
        channel: slackId,
        text: '✅ *Success!* Your Google account has been successfully connected to the Slack Bot. You can now use the `/docs` command to search your Drive.'
      });
    } catch (msgErr) {
      console.error('Failed to send success DM on Slack:', msgErr.message);
    }

    // Respond with a success page
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #4CAF50;">Authentication Successful!</h1>
          <p>You have successfully connected your Google account to the Slack Bot.</p>
          <p>You may now close this window and return to Slack to use the <strong>/doc</strong> command.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth Callback Error:', error.message);
    res.status(500).send('Authentication failed. Please check the server logs.');
  }
});

(async () => {
  // Start your app
  await app.start();

  console.log(`⚡️ Slack bot Socket Mode is running!`);
  
  // Start the custom Express server for OAuth callbacks
  expressApp.listen(env.PORT, () => {
    console.log(`🌍 Express server listening on port ${env.PORT} for Google Auth callbacks`);
  });
})();
