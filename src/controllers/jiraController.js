const jiraService = require('../services/jiraService');
const slackBlocks = require('../utils/slackBlocks');

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
async function handleTransitionAction({ action, ack, respond }) {
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

module.exports = {
  handleJiraCommand,
  handleTransitionAction,
  handleJiraReportCommand,
  handleJiraTeamCommand,
  handleJiraProjectsCommand
};
