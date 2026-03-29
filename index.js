import http from 'http';
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { connectDB, getBalance } from './utils/db.js';
import { handleHorseRacing, handleHorseRacingInteraction } from './games/horse_racing.js';
import { handleBauCua, handleBauCuaInteraction } from './games/baucua.js';

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

client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
  // Kết nối đến MongoDB
  await connectDB();
});

// Xử lý Lệnh chat (Prefix commands)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    if (['balance', 'b', 'coins', 'money', 'sd'].includes(command)) {
      const balance = await getBalance(message.author.id, message.author.username);
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
- \`!balance\` (\`!b\`, \`!money\`, \`!coins\`, \`!sd\`): Kiểm tra số dư / nhận 1000 coins lần đầu.
- \`!dn start\`: Mở phòng đua ngựa (đặt cược bằng nút bấm).
- \`!bc start\`: Mở phòng bầu cua (đặt cược bằng nút bấm).
      `;
      return message.reply(helpMsg.trim());
    }
  } catch (error) {
    console.error('Error handling command:', error);
    message.reply('Đã xảy ra lỗi khi xử lý lệnh của bạn!').catch(console.error);
  }
});

// Xử lý Sự kiện Nút bấm & Cửa sổ nhập liệu (Interactions)
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.customId?.startsWith('bet_horse_') || interaction.customId?.startsWith('modal_horse_')) {
      return handleHorseRacingInteraction(interaction);
    }

    if (interaction.customId?.startsWith('bet_bc_') || interaction.customId?.startsWith('modal_bc_')) {
      return handleBauCuaInteraction(interaction);
    }
  } catch (e) {
    console.error('Interaction Error:', e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Đã xảy ra lỗi khi xử lý thao tác của bạn!', ephemeral: true }).catch(() => { });
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Vui lòng cung cấp DISCORD_TOKEN trong file .env");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

// Khởi tạo một Web Server "giả lập" (Dummy Server)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Hệ thống Discord Bot Game đang hoạt động 24/7!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 [Render Config] Dummy Web Server đang giữ cổng (PORT): ${PORT}`);
});
