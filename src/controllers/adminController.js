const db = require('../database/db');

/**
 * Handle the /jira-grant-admin slash command
 * ONLY an existing admin can use this (enforced by middleware).
 */
async function handleGrantAdminCommand({ command, ack, respond }) {
  await ack();

  const rawText = command.text.trim();

  if (!rawText) {
    await respond({
      response_type: 'ephemeral',
      text: '⚠️ Please mention a user or provide a Slack ID. Example: `/jira-grant-admin @John Doe`'
    });
    return;
  }

  // Slack mentions format: <@U1234XYZ|username> or just <@U1234XYZ>
  // Let's use Regex to extract the pure Slack ID
  const mentionRegex = /<@([A-Z0-9]+)(\|[^>]+)?>/;
  const match = rawText.match(mentionRegex);

  let targetId = rawText; // Fallback to raw text if they typed an ID manually
  if (match && match[1]) {
    targetId = match[1];
  }

  try {
    // Upsert into SQLite
    await db.setUserRole(targetId, 'admin');

    await respond({
      response_type: 'in_channel',
      text: `✅ User <@${targetId}> has been granted *Admin* privileges for the Jira Bot.`
    });
  } catch (error) {
    console.error(`Error granting admin to ${targetId}:`, error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Database error while trying to grant Admin access to ${targetId}.`
    });
  }
}

module.exports = {
  handleGrantAdminCommand
};
