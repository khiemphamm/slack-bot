const axios = require('axios');

const rawDomain = process.env.JIRA_DOMAIN || 'your-domain.atlassian.net';
const JIRA_DOMAIN = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

/**
 * create generic Jira Axios client
 */
const jiraClient = axios.create({
  baseURL: `https://${JIRA_DOMAIN}/rest/api/3`,
  headers: {
    'Authorization': `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
    'Accept': 'application/json'
  }
});

/**
 * Fetch issue details by Issue Key or ID
 * @param {string} issueIdOrKey - e.g. PROJ-123
 */
async function getIssue(issueIdOrKey) {
  try {
    const response = await jiraClient.get(`/issue/${issueIdOrKey}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching Jira issue ${issueIdOrKey}:`, error.message);
    throw error;
  }
}

/**
 * Fetch available transitions for an issue
 * @param {string} issueIdOrKey 
 */
async function getTransitions(issueIdOrKey) {
  try {
    const response = await jiraClient.get(`/issue/${issueIdOrKey}/transitions`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching transitions for ${issueIdOrKey}:`, error.message);
    throw error;
  }
}

/**
 * Transition an issue to a new status
 * @param {string} issueIdOrKey 
 * @param {string} transitionId 
 */
async function transitionIssue(issueIdOrKey, transitionId) {
  try {
    const response = await jiraClient.post(`/issue/${issueIdOrKey}/transitions`, {
      transition: {
        id: transitionId
      }
    });
    return response.status === 204;
  } catch (error) {
    console.error(`Error transitioning issue ${issueIdOrKey}:`, error.message);
    throw error;
  }
}

/**
 * Fetch project metrics via JQL search
 * @param {string} projectKey - e.g. PROJ
 */
async function getProjectMetrics(projectKey) {
  try {
    // Search max 100 recent issues for simple stats using the new /search/jql endpoint
    const jql = `project = "${projectKey}" ORDER BY updated DESC`;
    const response = await jiraClient.post('/search/jql', {
      jql,
      maxResults: 100,
      fields: ['status', 'issuetype', 'project', 'assignee']
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching metrics for project ${projectKey}:`, error.message);
    throw error;
  }
}

/**
 * Fetch all accessible projects
 */
async function getProjects() {
  try {
    const response = await jiraClient.get('/project');
    return response.data;
  } catch (error) {
    console.error('Error fetching Jira projects:', error.message);
    throw error;
  }
}

/**
 * Fetch a User's Account ID by their email or name
 * @param {string} searchQuery - The email or name to search for
 */
async function searchUser(searchQuery) {
  try {
    const response = await jiraClient.get('/user/search', {
      params: { query: searchQuery, maxResults: 1 }
    });
    return response.data;
  } catch (error) {
    console.error(`Error searching Jira user by "${searchQuery}":`, error.message);
    throw error;
  }
}

/**
 * Add a comment to an issue
 * @param {string} issueKey - The Jira issue key
 * @param {string} text - The comment body
 * @param {string} [mentionAccountId] - Optional Jira Account ID to mention at the end
 */
async function addComment(issueKey, text, mentionAccountId = null) {
  const paragraphContent = [];

  let fullText = text;
  if (mentionAccountId) {
    if (!fullText.endsWith(' ')) fullText += ' ';
    fullText += `[~accountid:${mentionAccountId}]`;
  }

  // Regex to extract [~accountid:ACCOUNT_ID] syntax into ADF Mention nodes
  const mentionRegex = /\[~accountid:([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(fullText)) !== null) {
    if (match.index > lastIndex) {
      paragraphContent.push({
        type: 'text',
        text: fullText.substring(lastIndex, match.index)
      });
    }

    paragraphContent.push({
      type: 'mention',
      attrs: { id: match[1] }
    });

    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < fullText.length) {
    paragraphContent.push({
      type: 'text',
      text: fullText.substring(lastIndex)
    });
  }

  // Jira ADF doesn't allow empty paragraph content
  if (paragraphContent.length === 0) {
    paragraphContent.push({ type: 'text', text: ' ' });
  }

  try {
    const response = await jiraClient.post(`/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: paragraphContent
          }
        ]
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error adding comment to issue ${issueKey}:`, error.message);
    throw error;
  }
}

/**
 * Fetch assignable users for a project
 * @param {string} projectKey 
 */
async function getProjectUsers(projectKey) {
  try {
    const response = await jiraClient.get('/user/assignable/search', {
      params: { project: projectKey }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching assignable users for project ${projectKey}:`, error.message);
    throw error;
  }
}

/**
 * Assign an issue to a user
 * @param {string} issueKey 
 * @param {string} accountId - The Jira Account ID to assign to (or null to unassign)
 */
async function assignIssue(issueKey, accountId) {
  try {
    const response = await jiraClient.put(`/issue/${issueKey}/assignee`, {
      accountId: accountId
    });
    return response.status === 204;
  } catch (error) {
    console.error(`Error assigning issue ${issueKey} to ${accountId}:`, error.message);
    throw error;
  }
}

/**
 * Fetch issues assigned to a specific user
 * @param {string} accountId 
 */
async function getUserIssues(accountId) {
  try {
    const jql = `assignee="${accountId}" AND resolution = Unresolved ORDER BY updated DESC`;
    const response = await jiraClient.post('/search/jql', {
      jql,
      maxResults: 100,
      fields: ['summary', 'status', 'project', 'issuetype']
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching issues for user ${accountId}:`, error.message);
    throw error;
  }
}

module.exports = {
  getIssue,
  getTransitions,
  transitionIssue,
  getProjectMetrics,
  getProjects,
  searchUser,
  addComment,
  getProjectUsers,
  assignIssue,
  getUserIssues
};
