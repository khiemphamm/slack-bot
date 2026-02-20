const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Store DB in the root of the project
const dbPath = path.resolve(__dirname, '../../database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    // Create users table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS user_mapping (
      slack_id TEXT PRIMARY KEY,
      jira_account_id TEXT NOT NULL,
      jira_email TEXT
    )`, (err) => {
      if (err) {
        console.error('Error creating user_mapping table', err.message);
      } else {
        console.log('Database and user_mapping table ready');
      }
    });
  }
});

/**
 * Save user mapping
 */
function saveUserMapping(slackId, jiraAccountId, jiraEmail) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO user_mapping (slack_id, jira_account_id, jira_email) VALUES (?, ?, ?)`,
      [slackId, jiraAccountId, jiraEmail],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

/**
 * Get user mapping
 */
function getUserMapping(slackId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM user_mapping WHERE slack_id = ?`,
      [slackId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

/**
 * Delete user mapping
 */
function deleteUserMapping(slackId) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM user_mapping WHERE slack_id = ?`,
      [slackId],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

module.exports = {
  db,
  saveUserMapping,
  getUserMapping,
  deleteUserMapping
};
