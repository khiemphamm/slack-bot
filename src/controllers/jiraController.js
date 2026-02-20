const jiraService = require('../services/jiraService');
const slackBlocks = require('../utils/slackBlocks');
const db = require('../database/db');

/**
 * Handle the /jira slash command
 */
async function handleJiraCommand({ command, ack, respond }) {
  // Acknowledge command request right away to prevent timeout
  await ack();

  const issueKey = command.text.trim();

  // Validate input
  if (!issueKey) {
    await respond({
      response_type: 'ephemeral',
      text: 'Please provide a Jira issue key. Example: `/jira PROJ-123`'
    });
    return;
  }

  try {
    // Send a loading message since Jira API might take a second or two
    await respond({
      response_type: 'ephemeral',
      text: `Fetching details for ${issueKey}... ⏳`
    });

    // Fetch from Jira
    const issueData = await jiraService.getIssue(issueKey);
    const transitionsData = await jiraService.getTransitions(issueKey);

    // Build the fancy Slack UI
    const blocks = slackBlocks.buildIssueMessageBlocks(issueData, issueKey, transitionsData?.transitions);

    // Send the actual result
    await respond({
      response_type: 'in_channel', // Visible to everyone in the channel
      blocks: blocks,
      text: `Jira Issue: ${issueKey}` // Fallback text for notifications
    });

  } catch (error) {
    let errorMessage = 'An error occurred while fetching the Jira issue.';
    
    // Handle 404 from Jira specifically
    if (error.response && error.response.status === 404) {
      errorMessage = `Could not find Jira issue \`${issueKey}\`. Please check the ID.`;
    } else if (error.response && error.response.status === 401) {
      errorMessage = 'Unauthorized to access Jira. Please verify credentials.';
    }

    await respond({
      response_type: 'ephemeral',
      text: `❌ ${errorMessage}`
    });
  }
}

/**
 * Handle transition button clicks
 */
async function handleTransitionAction({ action, ack, respond, body }) {
  await ack();
  
  try {
    const actionPayload = JSON.parse(action.value);
    const { issueKey, transitionId } = actionPayload;

    // Change original message to a loading state
    await respond({
      replace_original: true,
      text: `Processing transition... ⏳`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⏳ *Updating status for ${issueKey}...*`
          }
        }
      ]
    });

    // Fire the API call
    await jiraService.transitionIssue(issueKey, transitionId);

    // Identify the user who clicked the button and comment
    try {
      const slackId = body.user.id;
      const transitionName = action.text && action.text.text ? action.text.text : 'new status';

      if (slackId) {
        const userMap = await db.getUserMapping(slackId);
        if (userMap && userMap.jira_account_id) {
          // Pass the account ID separately so Jira Service can construct the ADF mention node
          const textPrefix = `🔄 Status updated to "${transitionName}" from Slack by `;
          await jiraService.addComment(issueKey, textPrefix, userMap.jira_account_id);
        } else {
          // Fallback: If no map, just document that Slack changed it
          const fallbackBody = `🔄 Status updated to "${transitionName}" from Slack by user (Slack ID: ${slackId}). Use \`/jira-map\` to link your account.`;
          await jiraService.addComment(issueKey, fallbackBody);
        }
      }
    } catch (dbErr) {
      console.error('Error logging transition identity:', dbErr);
    }

    // Fetch updated data
    const issueData = await jiraService.getIssue(issueKey);
    const transitionsData = await jiraService.getTransitions(issueKey);
    const blocks = slackBlocks.buildIssueMessageBlocks(issueData, issueKey, transitionsData?.transitions);

    // Update the message so it has the new status
    await respond({
      replace_original: true,
      blocks: blocks,
      text: `Updated Jira Issue: ${issueKey}`
    });

  } catch (error) {
    console.error('Error handling transition action:', error);
    await respond({
        text: `❌ Failed to update issue.`,
        ephemeral: true
    });
  }
}

/**
 * Handle the /jira-report slash command
 */
async function handleJiraReportCommand({ command, ack, respond }) {
  await ack();

  const projectKey = command.text.trim().toUpperCase();

  if (!projectKey) {
    await respond({
      response_type: 'ephemeral',
      text: 'Please provide a Jira Project Key. Example: `/jira-report PROJ`'
    });
    return;
  }

  try {
    await respond({
      response_type: 'ephemeral',
      text: `Calculating statistics for project ${projectKey}... 📊⏳`
    });

    const metricsData = await jiraService.getProjectMetrics(projectKey);
    const blocks = slackBlocks.buildProjectStatsBlocks(metricsData, projectKey);

    await respond({
      response_type: 'in_channel',
      blocks: blocks,
      text: `Project Statistics: ${projectKey}`
    });

  } catch (error) {
    console.error('Error handling jira report command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error calculating project statistics. Please check if the project key \`${projectKey}\` is correct.`
    });
  }
}

/**
 * Handle the /jira-team slash command
 */
async function handleJiraTeamCommand({ command, ack, respond }) {
  await ack();

  const projectKey = command.text.trim().toUpperCase();

  if (!projectKey) {
    await respond({
      response_type: 'ephemeral',
      text: 'Please provide a Jira Project Key. Example: `/jira-team PROJ`'
    });
    return;
  }

  try {
    await respond({
      response_type: 'ephemeral',
      text: `Fetching team workload for project ${projectKey}... 👥⏳`
    });

    const metricsData = await jiraService.getProjectMetrics(projectKey);
    const blocks = slackBlocks.buildAssigneeStatsBlocks(metricsData, projectKey);

    await respond({
      response_type: 'in_channel',
      blocks: blocks,
      text: `Team Workload: ${projectKey}`
    });

  } catch (error) {
    console.error('Error handling jira team command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error calculating team workload. Please check if the project key \`${projectKey}\` is correct.`
    });
  }
}

/**
 * Handle the /jira-projects slash command
 */
async function handleJiraProjectsCommand({ ack, respond }) {
  await ack();

  try {
    await respond({
      response_type: 'ephemeral',
      text: `Fetching your accessible Jira projects... 📂⏳`
    });

    const projectsData = await jiraService.getProjects();
    const blocks = slackBlocks.buildProjectsListBlocks(projectsData);

    await respond({
      response_type: 'ephemeral', // Keep this ephemeral so long lists don't clutter the channel
      blocks: blocks,
      text: `Jira Projects List`
    });

  } catch (error) {
    console.error('Error handling jira projects command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error fetching Jira projects. Please verify your Jira token permissions.`
    });
  }
}

/**
 * Handle the /jira-map slash command
 * Maps a Slack ID to a Jira Account ID via email search
 */
async function handleJiraMapCommand({ command, ack, respond, body }) {
  await ack();

  const email = command.text.trim();
  const slackId = body.user_id;

  if (!email || !email.includes('@')) {
    await respond({
      response_type: 'ephemeral',
      text: '⚠️ Please provide a valid Jira email address. Example: `/jira-map firstname.lastname@company.com`'
    });
    return;
  }

  try {
    const users = await jiraService.getUserByEmail(email);
    
    if (users && users.length > 0) {
      const jiraUser = users[0];
      const accountId = jiraUser.accountId;
      const displayName = jiraUser.displayName;

      // Save to SQLite
      await db.saveUserMapping(slackId, accountId, email);

      await respond({
        response_type: 'ephemeral',
        text: `✅ Success! Your Slack account is now linked to the Jira account: *${displayName}* (${email}).`
      });
    } else {
      await respond({
        response_type: 'ephemeral',
        text: `❌ Could not find a Jira account matching the email: \`${email}\`. Please check your spelling and ensure the account exists in this workspace.`
      });
    }
  } catch (error) {
    console.error('Error mapping user:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error connecting to Jira API while searching for your email.`
    });
  }
}

module.exports = {
  handleJiraCommand,
  handleTransitionAction,
  handleJiraReportCommand,
  handleJiraTeamCommand,
  handleJiraProjectsCommand,
  handleJiraMapCommand
};
