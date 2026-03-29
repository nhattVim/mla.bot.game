import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'database.json');

// Initialize DB if not exists
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2), 'utf8');
}

export function getBalance(userId) {
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return data[userId] !== undefined ? data[userId] : 1000; // Default 1000 coins
  } catch (error) {
    console.error('Error reading DB:', error);
    return 1000;
  }
}

export function updateBalance(userId, amount) {
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const currentBalance = data[userId] !== undefined ? data[userId] : 1000;
    data[userId] = currentBalance + amount;
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return data[userId];
  } catch (error) {
    console.error('Error writing DB:', error);
    return 1000;
  }
}

// Ensure the user has enough balance
export function checkBalance(userId, amount) {
  const balance = getBalance(userId);
  return balance >= amount;
}
