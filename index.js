import http from 'http';
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { connectDB, getBalance, claimDaily } from './utils/db.js';
import { handleHorseRacing, handleHorseRacingInteraction } from './games/horse_racing.js';
import { handleBauCua, handleBauCuaInteraction } from './games/baucua.js';
import { handleOanTuTi, handleOanTuTiInteraction } from './games/oantuti.js';
import { handleShop, handleShopInteraction, SHOP_ITEMS } from './games/shop.js';
import { getUserInventory } from './utils/db.js';

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
    if (command === 'b') {
      const balance = await getBalance(message.author.id, message.author.username);
      const inventory = await getUserInventory(message.author.id, message.author.username);

      let titleStr = '';
      let consumableStr = '';

      if (inventory['title_vip']) titleStr = ' - ' + SHOP_ITEMS['title_vip'].emoji + ' ' + SHOP_ITEMS['title_vip'].name;
      else if (inventory['title_tanbinh']) titleStr = ' - ' + SHOP_ITEMS['title_tanbinh'].emoji + ' ' + SHOP_ITEMS['title_tanbinh'].name;

      if (inventory['bua_mien_tu']) consumableStr += `\n🛡️ Bùa Miễn Tử: **${inventory['bua_mien_tu']}** cái`;
      if (inventory['x2_reward']) consumableStr += `\n💰 Vé Tranh Đoạt x2: **${inventory['x2_reward']}** cái`;

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setAuthor({ name: message.author.username + titleStr, iconURL: message.author.displayAvatarURL() })
        .setDescription(`💰 Két sắt hiện tại của VIP đang có: **${balance.toLocaleString()}** coins.` + (consumableStr ? `\n\n**🎒 Hành Trang (Tự dụng):**${consumableStr}` : ''));
      return message.reply({ embeds: [embed] });
    }

    if (command === 'dd') {
      const result = await claimDaily(message.author.id, message.author.username);
      if (!result.success) {
        return message.reply({ content: `🚫 **THẤT BẠI:** ${result.message}` });
      } else {
        const embed = new EmbedBuilder()
          .setColor('#f1c40f')
          .setTitle('📅 ĐIỂM DANH HẰNG NGÀY')
          .setDescription(`Chúc mừng <@${message.author.id}> đã nhận lương **${result.reward.toLocaleString()} coins**!\n\nSố dư mới: **${result.balance.toLocaleString()} coins**.\nHãy quay lại điểm danh nữa sau **00:00 (Nửa Đêm)**.`);
        return message.reply({ embeds: [embed] });
      }
    }

    if (command === 'dn') {
      return handleHorseRacing(message, args);
    }

    if (command === 'bc') {
      return handleBauCua(message, args);
    }

    if (command === 'ott') {
      return handleOanTuTi(message, args);
    }

    if (command === 'shop' || command === 's') {
      return handleShop(message, args);
    }

    if (command === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('📖 SÁCH HƯỚNG DẪN CÚ PHÁP ĐƠN GIẢN NHẤT 🎮')
        .setColor('#9b59b6')
        .setDescription('Tin vui! Tất cả các lệnh dư thừa rườm rà đã bị lược bỏ bớt. Giờ đây Backend xử lý chớp nhoáng với 5 câu lệnh ngắn nhất vũ trụ:\n\n**DANH SÁCH LỆNH CHÍNH:**')
        .addFields(
          { name: '💰 Quản Lý Ví', value: '`!b`: Xem số dư ngân hàng hiện tại của bạn.\n`!dd`: Lấy lương ngẫu nhiên 200 - 2,000 coin mỗi ngày một lần (Khôi phục lúc Nửa Đêm).', inline: false },
          { name: '🐎 Mở Chuồng Đua Ngựa', value: 'Gõ: `!dn`\n👉 Bot bung giao diện cược, chọn màu ngựa qua Nút.', inline: false },
          { name: '🎲 Lắc Bầu Cua Tôm Cá', value: 'Gõ: `!bc`\n👉 Xóc dĩa online, chọn linh vật thông qua Nút.', inline: false },
          { name: '✌️ Thách Đấu Oẳn Tù Tì', value: 'Gõ: `!ott @TagNgườiKìa <Số_tiền>`\n👉 Kéo búa bao đẫm máu 1 vs 1. Ai thua đền trọn tiền mạng.', inline: false },
          { name: '🏪 Mở Cửa Hàng Bách Hoá', value: 'Gõ: `!shop` hoặc `!s`\n👉 Sắm Danh Hiệu đổi Đời hiển thị (gõ `!b` để xem) kèm theo các Vật Phẩm Tiêu Hoá Tránh Tử cho Games.', inline: false }
        )
        .setFooter({ text: 'Chú ý: Tuyệt đối không gõ dài dòng hay sai cú pháp (như !bc start nữa). Bot sẽ ngó lơ luôn đó!' });
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

    if (interaction.customId?.startsWith('shopbuy_')) {
      return handleShopInteraction(interaction);
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
