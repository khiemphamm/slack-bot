/**
 * Format a Jira issue into a Slack Block Kit message array
 * @param {Object} issue - Data response from Jira API
 * @param {string} issueKey - Jira issue key (e.g. PROJ-123)
 * @param {Array} transitions - Available transitions
 * @returns {Array} Slack Block Kit blocks array
 */
function buildIssueMessageBlocks(issue, issueKey, transitions = []) {
  const rawDomain = process.env.JIRA_DOMAIN || 'your-domain.atlassian.net';
  const JIRA_DOMAIN = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  const summary = issue.fields?.summary || 'No Summary';
  const statusName = issue.fields?.status?.name || 'Unknown Status';
  const assigneeName = issue.fields?.assignee?.displayName || 'Unassigned';
  const issueLink = `https://${JIRA_DOMAIN}/browse/${issueKey}`;
  
  // Clean description - handles basic Jira document text (very simplified)
  // Jira v3 API returns an Atlassian Document Format JSON object
  // Here we just say "Description exists" or "No description" for MVP purposes
  const hasDescription = issue.fields?.description && issue.fields.description.content ? true : false;
  const descText = hasDescription ? '📝 Description available on Jira' : '📝 No description provided';

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🎫 ${issueKey}: ${summary}`,
        emoji: true
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Status:*\n${statusName}`
        },
        {
          type: 'mrkdwn',
          text: `*Assignee:*\n${assigneeName}`
        }
      ]
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: descText
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View in Jira',
            emoji: true
          },
          url: issueLink,
          action_id: 'view_jira_issue'
        }
      ]
    }
  ];

  // Add Transition Buttons if available
  if (transitions && transitions.length > 0) {
    const transitionButtons = transitions.slice(0, 4).map(t => ({
      type: 'button',
      text: {
        type: 'plain_text',
        text: t.name,
        emoji: true
      },
      value: JSON.stringify({ issueKey, transitionId: t.id }),
      action_id: `transition_${t.id}`
    }));

    blocks.push({
      type: 'actions',
      elements: transitionButtons
    });
  }

  return blocks;
}

/**
 * Format project statistics into a Slack Block Kit message array
 * @param {Object} metricsData - Data response from Jira /search API
 * @param {string} projectKey - Jira project key
 * @returns {Array} Slack Block Kit blocks array
 */
function buildProjectStatsBlocks(metricsData, projectKey) {
  const issues = metricsData.issues || [];
  const totalIssues = metricsData.total || issues.length;

  if (totalIssues === 0) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📊 *Project ${projectKey} Statistics*\nNo issues found in this project yet.`
        }
      }
    ];
  }

  // Count by specific status name (e.g. "To Do", "In Progress", "In Review")
  const statusCounts = {};

  issues.forEach(issue => {
    const statusName = issue.fields?.status?.name || 'Unknown';
    if (!statusCounts[statusName]) {
      statusCounts[statusName] = 0;
    }
    statusCounts[statusName]++;
  });

  // Calculate percentages based on fetched issues
  const fetchedCount = issues.length;
  const barLength = 20;

  // Set of Emojis to iterate through for the progress blocks
  const blockEmojis = ['🟩', '🟨', '🟦', '🟪', '🟧', '🟥', '🟫', '⬜'];
  
  // Sort statuses by count descending for the UI list
  const sortedStatuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  
  let progressBar = '';
  let progressLabels = [];
  let remainingBars = barLength;

  // Build the dynamic progress bar elements
  const statusFields = sortedStatuses.map(([statusName, count], index) => {
    // Assign a block color to this status (cycle through if more than 8 statuses)
    const blockEmoji = blockEmojis[index % blockEmojis.length];
    
    // Calculate percentage and bar segments
    const percent = Math.round((count / fetchedCount) * 100) || 0;
    
    // Distribute the 20 block spaces proportionally
    // The very last item gets whatever is remaining to account for rounding errors
    let segments = Math.round((percent / 100) * barLength);
    if (index === sortedStatuses.length - 1) {
       segments = remainingBars;
    } else {
       remainingBars -= segments;
       if (remainingBars < 0) remainingBars = 0; // Guard against negative
    }
    
    // Add to the bar string
    if (segments > 0) {
      progressBar += blockEmoji.repeat(segments);
    }
    
    // Add to the label underneath the bar
    progressLabels.push(`${blockEmoji} \`${percent}% ${statusName}\``);
    
    return {
      type: 'mrkdwn',
      text: `*${blockEmoji} ${statusName}:*\n${count} tasks`
    };
  });
  
  // If no blocks were added (e.g all 0 length) just fill with empty squares
  if (progressBar.length === 0) {
    progressBar = '⬜'.repeat(barLength);
  }

  // Extract Project Name from the first issue (Jira includes project data if requested)
  const projectName = issues.length > 0 && issues[0].fields?.project?.name 
    ? issues[0].fields.project.name 
    : projectKey;

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 Project: ${projectName} Overview`,
        emoji: true
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Based on the latest ${fetchedCount} issues (Total in backlog: ${totalIssues})`
        }
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Progress Bar:*\n${progressBar}\n${progressLabels.join(' | ')}`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      fields: [
        ...statusFields,
        {
          type: 'mrkdwn',
          text: `*📦 Total Fetched:*\n${fetchedCount} tasks`
        }
      ]
    }
  ];
}

/**
 * Format assignee statistics into a Slack Block Kit message array
 * @param {Object} metricsData - Data response from Jira /search API
 * @param {string} projectKey - Jira project key
 * @returns {Array} Slack Block Kit blocks array
 */
function buildAssigneeStatsBlocks(metricsData, projectKey) {
  const issues = metricsData.issues || [];
  const totalIssues = metricsData.total || issues.length;

  if (totalIssues === 0) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `👥 *Team Workload: ${projectKey}*\nNo issues found in this project.`
        }
      }
    ];
  }

  // Extract Project Name
  const projectName = issues.length > 0 && issues[0].fields?.project?.name 
    ? issues[0].fields.project.name 
    : projectKey;

  // Group issues by Assignee and their exact Status Names
  const assigneeStats = {};

  issues.forEach(issue => {
    // Treat unassigned as a specific bucket
    const assigneeName = issue.fields?.assignee?.displayName || 'Unassigned';
    const statusName = issue.fields?.status?.name || 'Unknown';

    if (!assigneeStats[assigneeName]) {
      assigneeStats[assigneeName] = { 
        total: 0, 
        statuses: {} 
      };
    }
    
    assigneeStats[assigneeName].total++;
    
    if (!assigneeStats[assigneeName].statuses[statusName]) {
      assigneeStats[assigneeName].statuses[statusName] = 0;
    }
    assigneeStats[assigneeName].statuses[statusName]++;
  });

  // Build Output Blocks
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `👥 Team Workload: ${projectName}`,
        emoji: true
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Showing active workload distribution for the latest ${issues.length} tasks.`
        }
      ]
    },
    {
      type: 'divider'
    }
  ];

  // Sort assignees by total tasks descending
  const sortedAssignees = Object.entries(assigneeStats).sort((a, b) => b[1].total - a[1].total);

  sortedAssignees.forEach(([name, stats]) => {
    // Build a line showing exact status counts: e.g. "🔹 2 In Review | ✅ 1 Done"
    const statusDetails = Object.entries(stats.statuses)
      .sort((a, b) => b[1] - a[1])
      .map(([statusName, count]) => {
        let emoji = '🔹';
        if (statusName.toLowerCase().includes('done') || statusName.toLowerCase().includes('closed')) emoji = '✅';
        else if (statusName.toLowerCase().includes('progress') || statusName.toLowerCase().includes('review')) emoji = '⏳';
        else if (statusName.toLowerCase().includes('to do') || statusName.toLowerCase().includes('open')) emoji = '📝';
        
        return `${emoji} \`${count} ${statusName}\``;
      })
      .join(' | ');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*👤 ${name}* (${stats.total} tasks)\n${statusDetails}`
      }
    });
  });

  return blocks;
}

/**
 * Format the list of projects into a Slack Block Kit message array
 * @param {Array} projects - Array of project objects from Jira /project API
 * @returns {Array} Slack Block Kit blocks array
 */
function buildProjectsListBlocks(projects = []) {
  if (projects.length === 0) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📂 *Jira Projects*\nYou don't have access to any Jira projects with this token.`
        }
      }
    ];
  }

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📂 Accessible Jira Projects`,
        emoji: true
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Found ${projects.length} projects connected to this workspace.`
        }
      ]
    },
    {
      type: 'divider'
    }
  ];

  // List each project as a section
  projects.forEach(p => {
    let typeEmoji = p.projectTypeKey === 'software' ? '💻' : (p.projectTypeKey === 'business' ? '💼' : '📁');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${typeEmoji} *${p.name}*\n🏷️ \`Key: ${p.key}\` | 🗂️ \`Type: ${p.projectTypeKey}\``
      }
    });
  });

  return blocks;
}

module.exports = {
  buildIssueMessageBlocks,
  buildProjectStatsBlocks,
  buildAssigneeStatsBlocks,
  buildProjectsListBlocks
};
