import http from 'http';
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { connectDB, getBalance } from './utils/db.js';
import { handleHorseRacing, handleHorseRacingInteraction } from './games/horse_racing.js';
import { handleBauCua, handleBauCuaInteraction } from './games/baucua.js';
import { handleOanTuTi, handleOanTuTiInteraction } from './games/oantuti.js';

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

    if (command === 'oantuti' || command === 'ott') {
      return handleOanTuTi(message, args);
    }

    if (['help', 'h', 'huongdan', 'hd', 'menu'].includes(command)) {
      const embed = new EmbedBuilder()
        .setTitle('📖 SÁCH HƯỚNG DẪN SỬ DỤNG BOT GAME 🎮')
        .setColor('#9b59b6')
        .setDescription('Chào mừng VIP đã ngự giá đến thiên đường giải trí đỉnh cao! Tiền không tự sinh ra cũng không tự mất đi, nó chỉ chạy từ túi bạn sang túi... Chủ Cấn.\n\n**Dưới đây là danh sách toàn bộ các lệnh đang hoạt động:**')
        .addFields(
          { name: '💰 Kiểm Tra Két Sắt', value: 'Gõ: `!money`\n👉 Xem số dư hiện tại. Lần đầu sử dụng thẻ sẽ được ngân hàng miễn phí **1,000 coins** làm vốn.', inline: false },
          { name: '🐎 Trường Đua Ngựa Điện Tử', value: 'Gõ: `!dn start`\n👉 Mở cổng Cược Đua Ngựa. Trò chơi bấm nút cực nhanh, tỷ lệ ăn ngất ngưởng x4.', inline: false },
          { name: '🎲 Xóc Dĩa Bầu Cua Tôm Cá', value: 'Gõ: `!bc start`\n👉 Mở Sòng xóc Bầu Cua. Chọn mặt gửi vàng qua 6 cái Icon nút bấm. Số lượng xúc xắc ra bao nhiêu mặt ăn bấy nhiêu lần.', inline: false },
          { name: '✌️ Oẳn Tù Tì PVP', value: 'Gõ: `!ott @TagDoiThu <Số_tiền_cược>`\n👉 Thách đấu Oẳn Tù Tì 1 vs 1. Ai thắng sẽ lột sạch tiền cược của kẻ bị thua. Cảnh báo bị phạt khi cố tình AFK!', inline: false }
        )
        .setFooter({ text: 'Chú ý: Giao dịch thông qua Nút Bấm rất hiện đại - Chúc các bác may mắn thoát khỏi cửa ải đê vỡ!' });
      return message.reply({ embeds: [embed] });
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

    if (interaction.customId?.startsWith('ott_')) {
      return handleOanTuTiInteraction(interaction);
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
