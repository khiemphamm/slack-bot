const { App } = require('@slack/bolt');
const env = require('./config/env');
const jiraController = require('./controllers/jiraController');


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
app.command('/jira-report', jiraController.handleJiraReportCommand);
app.command('/jira-team', jiraController.handleJiraTeamCommand);
app.command('/jira-projects', jiraController.handleJiraProjectsCommand);

// Register button click listener pattern (matches action_id starting with 'transition_')
app.action(/^transition_/, jiraController.handleTransitionAction);

// Acknowledge the 'View in Jira' button click to prevent timeout warnings in Slack
app.action('view_jira_issue', async ({ ack }) => {
  await ack();
});

(async () => {
  // Start your app
  await app.start();

  console.log(`⚡️ Slack bot is running on port ${env.PORT}!`);
})();
