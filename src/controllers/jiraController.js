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
    
    // Extract project key to fetch assignable users (Issue Keys are usually PROJ-123)
    const projectKeyMatch = issueKey.match(/^([A-Z0-9]+)-\d+$/i);
    let assignableUsers = [];
    if (projectKeyMatch) {
      try {
        assignableUsers = await jiraService.getProjectUsers(projectKeyMatch[1]);
      } catch (err) {
        console.warn('Could not fetch assignable users. Dropdown will be hidden.', err.message);
      }
    }

    // Build the fancy Slack UI
    const blocks = slackBlocks.buildIssueMessageBlocks(issueData, issueKey, transitionsData?.transitions, assignableUsers);

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
        let actorText = `user (Slack ID: ${slackId}). Use \`/jira-map\` to link your account.`;
        if (userMap && userMap.jira_account_id) {
          actorText = `[~accountid:${userMap.jira_account_id}]`;
        }
        const auditComment = `🔄 Status updated to "${transitionName}" from Slack by ${actorText}`;
        await jiraService.addComment(issueKey, auditComment);
      }
    } catch (dbErr) {
      console.error('Error logging transition identity:', dbErr);
    }

    // Fetch updated data
    const issueData = await jiraService.getIssue(issueKey);
    const transitionsData = await jiraService.getTransitions(issueKey);
    
    const projectKeyMatch = issueKey.match(/^([A-Z0-9]+)-\d+$/i);
    let assignableUsers = [];
    if (projectKeyMatch) {
      try {
        assignableUsers = await jiraService.getProjectUsers(projectKeyMatch[1]);
      } catch (err) {
        console.warn('Could not fetch assignable users.', err);
      }
    }

    const blocks = slackBlocks.buildIssueMessageBlocks(issueData, issueKey, transitionsData?.transitions, assignableUsers);

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
 * Handle opening the Add Comment modal
 */
async function handleOpenCommentModal({ body, ack, client }) {
  await ack();
  
  // Extract issueKey from the button value
  const issueKey = body.actions[0].value;
  
  try {
    // Generate the view for the given issue
    const modalView = slackBlocks.buildCommentModal(issueKey);

    // Call views.open with the built view
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modalView
    });
  } catch (error) {
    console.error('Error opening comment modal:', error);
  }
}

/**
 * Handle form submission of the Add Comment modal
 */
async function handleCommentSubmit({ ack, body, view, client }) {
  await ack();

  const issueKey = view.private_metadata;
  // Deep extract the comment text from the input block
  const commentText = view.state.values.comment_block.comment_input.value;
  const slackId = body.user.id;

  try {
    let accountId = null;
    const userMap = await db.getUserMapping(slackId);
    if (userMap && userMap.jira_account_id) {
      accountId = userMap.jira_account_id;
    }

    let prefix = '';
    if (accountId) {
      prefix = `💬 Comment from Slack by [~accountid:${accountId}]:\n`;
    } else {
      prefix = `💬 Comment from Slack User (ID: ${slackId}):\n`;
    }

    const finalComment = `${prefix}${commentText}`;
    await jiraService.addComment(issueKey, finalComment);

    // Optionally notify the user it was successful
    await client.chat.postMessage({
      channel: slackId, // DM the user
      text: `✅ Successfully added your comment to ${issueKey}.`
    });

  } catch (error) {
    console.error('Error submitting comment:', error);
  }
}

/**
 * Handle re-assigning an issue via the Slack Select Menu
 */
async function handleAssignIssueAction({ action, ack, respond, body }) {
  await ack();

  try {
    if (!action.selected_option || !action.selected_option.value) return;

    const payload = JSON.parse(action.selected_option.value);
    const { issueKey, accountId } = payload;
    const slackId = body.user.id; // Record who made the change

    // Show loading state
    await respond({
      replace_original: true,
      text: `Assigning issue... ⏳`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⏳ *Updating assignee for ${issueKey}...*`
          }
        }
      ]
    });

    // 1. Assign the issue
    await jiraService.assignIssue(issueKey, accountId);

    // 2. Add an audit log comment verifying who did it
    const userMap = await db.getUserMapping(slackId);
    const targetText = accountId ? `[~accountid:${accountId}]` : "Unassigned";
    let actorText = `user (Slack ID: ${slackId})`;

    if (userMap && userMap.jira_account_id) {
      actorText = `[~accountid:${userMap.jira_account_id}]`;
    }

    const auditComment = `🔄 Assignee updated to ${targetText} from Slack by ${actorText}`;
    await jiraService.addComment(issueKey, auditComment);

    // 3. Fetch latest data to re-render the card
    const issueData = await jiraService.getIssue(issueKey);
    const transitionsData = await jiraService.getTransitions(issueKey);
    
    const projectKeyMatch = issueKey.match(/^([A-Z0-9]+)-\d+$/i);
    let assignableUsers = [];
    if (projectKeyMatch) {
      try {
        assignableUsers = await jiraService.getProjectUsers(projectKeyMatch[1]);
      } catch (err) {
        console.warn('Could not fetch assignable users.', err);
      }
    }

    const blocks = slackBlocks.buildIssueMessageBlocks(issueData, issueKey, transitionsData?.transitions, assignableUsers);

    await respond({
      replace_original: true,
      blocks: blocks,
      text: `Updated Assignee on ${issueKey}`
    });

  } catch (error) {
    console.error('Error re-assigning issue:', error);
    await respond({
        text: `❌ Failed to re-assign issue.`,
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
    const users = await jiraService.searchUser(email);
    
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

/**
 * Handle the /jira-tasks slash command
 */
async function handleJiraTasksCommand({ command, ack, respond, body }) {
  await ack();

  const slackId = body.user_id;
  const targetUser = command.text.trim();

  try {
    let accountId = null;
    let displayName = 'You';

    if (targetUser) {
      const users = await jiraService.searchUser(targetUser);
      if (users && users.length > 0) {
        accountId = users[0].accountId;
        displayName = users[0].displayName;
      } else {
        await respond({
          response_type: 'ephemeral',
          text: `❌ Could not find a Jira account matching: \`${targetUser}\`.`
        });
        return;
      }
    } else {
      const userMap = await db.getUserMapping(slackId);
      if (userMap && userMap.jira_account_id) {
        accountId = userMap.jira_account_id;
      } else {
        await respond({
          response_type: 'ephemeral',
          text: `⚠️ You haven't linked your Slack account to Jira yet.\nUse \`/jira-map firstname.lastname@company.com\` to link it.\nOr search by someone's name/email directly: \`/jira-tasks John Doe\`.`
        });
        return;
      }
    }

    await respond({
      response_type: 'ephemeral',
      text: `Fetching active tasks for ${displayName}... 🎯⏳`
    });

    const issuesData = await jiraService.getUserIssues(accountId);
    const blocks = slackBlocks.buildUserIssuesBlocks(issuesData, displayName);

    await respond({
      response_type: 'ephemeral', // Personal to the user executing the command
      blocks: blocks,
      text: `Active Tasks for ${displayName}`
    });

  } catch (error) {
    console.error('Error handling jira tasks command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error fetching tasks from Jira.`
    });
  }
}

module.exports = {
  handleJiraCommand,
  handleTransitionAction,
  handleJiraReportCommand,
  handleJiraTeamCommand,
  handleJiraProjectsCommand,
  handleJiraMapCommand,
  handleOpenCommentModal,
  handleCommentSubmit,
  handleAssignIssueAction,
  handleJiraTasksCommand
};
