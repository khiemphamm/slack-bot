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
 * Fetch a User's Account ID by their email
 * @param {string} email - The email address to search for
 */
async function getUserByEmail(email) {
  try {
    const response = await jiraClient.get('/user/search', {
      params: { query: email, maxResults: 1 }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching Jira user by email ${email}:`, error.message);
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
  const paragraphContent = [{ type: 'text', text: text }];

  if (mentionAccountId) {
    paragraphContent.push({
      type: 'mention',
      attrs: { id: mentionAccountId }
    });
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

module.exports = {
  getIssue,
  getTransitions,
  transitionIssue,
  getProjectMetrics,
  getProjects,
  getUserByEmail,
  addComment
};
