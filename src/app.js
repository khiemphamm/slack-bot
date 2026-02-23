const { App } = require('@slack/bolt');
const env = require('./config/env');
const jiraController = require('./controllers/jiraController');
const adminController = require('./controllers/adminController');
const { requireAdmin } = require('./middlewares/authMiddleware');


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

(async () => {
  // Start your app
  await app.start();

  console.log(`⚡️ Slack bot is running on port ${env.PORT}!`);
})();
