import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { getBalance } from './utils/db.js';
import { handleHorseRacing } from './games/horse_racing.js';
import { handleBauCua } from './games/baucua.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const PREFIX = '!';

client.once('ready', () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Bỏ qua tin nhắn từ bot hoặc không bắt đầu bằng PREFIX
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    if (['balance', 'b', 'coins', 'money', 'sd'].includes(command)) {
      const balance = getBalance(message.author.id);
      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setDescription(`💰 Số dư hiện tại của bạn là: **${balance.toLocaleString()}** coins.`);
      return message.reply({ embeds: [embed] });
    }

    if (command === 'duangua' || command === 'dn') {
      return handleHorseRacing(message, args);
    }

    if (command === 'baucua' || command === 'bc') {
      return handleBauCua(message, args);
    }

    if (command === 'help') {
      const helpMsg = `
🎲 **Danh sách lệnh Mini-game Bot:**
- \`!balance\` (\`!b\`, \`!money\`, \`!coins\`): Kiểm tra số dư / nhận 1000 coins lần đầu tiên.
- \`!duangua\` (\`!dn\`): Chơi đua ngựa.
  - \`!dn start\`: Mở phòng cược đua ngựa (mặc định mở 30s).
  - \`!dn bet <1-5> <tiền>\`: Đặt cược 1 con ngựa mã (1-5).
- \`!baucua\` (\`!bc\`): Chơi bầu cua.
  - \`!bc start\`: Mở phòng cược bầu cua.
  - \`!bc bet <bau/cua/tom/ca/ga/nai> <tiền>\`: Đặt cược bầu cua.
      `;
      return message.reply(helpMsg.trim());
    }
  } catch (error) {
    console.error('Error handling command:', error);
    message.reply('Đã xảy ra lỗi khi xử lý lệnh của bạn!').catch(console.error);
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Vui lòng cung cấp DISCORD_TOKEN trong file .env");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
