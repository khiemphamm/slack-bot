const db = require('../database/db');
require('dotenv').config();

/**
 * Custom Slack Bolt Middleware to enforce Admin-only access.
 */
async function requireAdmin({ payload, body, next, respond, ack }) {
  // Extract user ID safely from payload or body (depends on if it's an action or command)
  const slackId = payload.user_id || (body.user && body.user.id) || payload.user;

  if (!slackId) {
    if (ack) await ack();
    if (respond) {
      await respond({
        text: '❌ Could not determine user identity for permission checks.',
        response_type: 'ephemeral'
      });
    }
    return;
  }

  // Check against Initial Admin bypass
  const initialAdminId = process.env.INITIAL_ADMIN_SLACK_ID;
  if (initialAdminId && slackId === initialAdminId) {
    console.log(`Bypassing auth for Initial Admin: ${slackId}`);
    await next();
    return;
  }

  // Check Database role
  try {
    const role = await db.getUserRole(slackId);
    
    if (role === 'admin') {
      await next();
    } else {
      if (ack) await ack();
      if (respond) {
        await respond({
          text: `🚫 *Access Denied* \nYou do not have permission to run this command. Ask an Administrator to grant you access using \`/jira-grant-admin <@your_name>\`.`,
          response_type: 'ephemeral'
        });
      }
    }
  } catch (error) {
    console.error('Error checking user role:', error);
    if (ack) await ack();
    if (respond) {
      await respond({
        text: '❌ Internal database error while verifying permissions.',
        response_type: 'ephemeral'
      });
    }
  }
}

/**
 * Helper to check if a user is an admin (returns boolean)
 */
async function checkIsAdmin(slackId) {
  const initialAdminId = process.env.INITIAL_ADMIN_SLACK_ID;
  if (initialAdminId && slackId === initialAdminId) {
    return true;
  }
  try {
    const role = await db.getUserRole(slackId);
    return role === 'admin';
  } catch (error) {
    console.error('Error checking user role:', error);
    return false;
  }
}

module.exports = {
  requireAdmin,
  checkIsAdmin
};
