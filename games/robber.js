import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getBalance, updateBalance } from '../utils/db.js';
import { activeWordChains } from './wordchain.js';
import { activeWordChainsVn } from './wordchain_vn.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const triviaDb = require('../data/trivia_vn.json');
const activeRobberGames = new Set();

// Thêm ID kênh bạn muốn Cướp xuất hiện vào mảng này. Ví dụ: ['1234567890', '0987654321']
// Nếu mảng trống, cướp có thể xuất hiện ở tất cả các kênh (trừ lúc đang nối từ).
const ALLOWED_CHANNELS = ['1487814656230821988', '1490298042639843468', '1490297986364739626'];

// Thuật toán đảo mảng (Fisher-Yates)
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

export async function checkRobberEvent(message) {
  const userId = message.author.id;
  const username = message.author.username;

  if (activeRobberGames.has(userId)) return;

  const channelId = message.channel.id;

  if (ALLOWED_CHANNELS.length > 0 && !ALLOWED_CHANNELS.includes(channelId)) {
    return;
  }

  // Tránh đứt mạch game trò nối từ
  if (activeWordChains.has(channelId) || activeWordChainsVn.has(channelId)) return;

  if (Math.random() > 0.1) return;

  const balance = await getBalance(userId, username);
  if (balance < 1000000000) return;

  activeRobberGames.add(userId);

  const randomTrivia = triviaDb[Math.floor(Math.random() * triviaDb.length)];
  const options = [...randomTrivia.options];
  shuffle(options);
  const correctIndex = options.indexOf(randomTrivia.answer);

  const LETTERS = ['A', 'B', 'C', 'D'];

  const questionDesc = `Bạn vừa bị chặn đường bởi một **Tên cướp trí tuệ**! 🎩\nHắn yêu cầu bạn trả lời chính xác câu hỏi sau trong vòng **15 GIÂY** nếu không muốn mất tiền.\n\n` +
    `> **❓ Câu hỏi:** ${randomTrivia.question}\n\n` +
    LETTERS.map((letter, index) => `**${letter}.** ${options[index]}`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🎩 TÊN CƯỚP TRÍ TUỆ ĐỔ BỘ! 🎩')
    .setColor('#FF0000')
    .setDescription(questionDesc)
    .setFooter({ text: '🕒 Thời gian lật ngoáy: 15 giây. Nhấp vào nút chữ cái bên dưới!' });

  const row = new ActionRowBuilder();
  LETTERS.forEach((letter, index) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`trivia_${userId}_${index}`)
        .setLabel(letter)
        .setStyle(ButtonStyle.Primary)
    );
  });

  const gameMsg = await message.channel.send({ content: `<@${userId}> Tên cướp trí tuệ đã xuất hiện!`, embeds: [embed], components: [row] }).catch(() => null);
  if (!gameMsg) {
    activeRobberGames.delete(userId);
    return;
  }

  const filter = i => i.customId.startsWith(`trivia_${userId}_`) && i.user.id === userId;
  const collector = gameMsg.createMessageComponentCollector({ filter, time: 15000, max: 1 });

  collector.on('collect', async i => {
    await i.deferUpdate().catch(() => { });
    const chosenIndex = parseInt(i.customId.split('_')[2], 10);

    if (chosenIndex === correctIndex) {
      activeRobberGames.delete(userId);
      const reward = 500000;
      await updateBalance(userId, username, reward);
      const winEmbed = new EmbedBuilder()
        .setTitle('🎉 Câu Trả Lời Hoàn Hảo! 🧠')
        .setColor('#57F287')
        .setDescription(`<@${userId}> quả là người có kho tàng kiến thức sâu rộng!\n\nTên cướp vô cùng ngưỡng mộ, xin phép cúi đầu rút lui và tặng lại bạn **${reward.toLocaleString()} coins**.\n\n✔️ **Đáp án chính xác:** ${randomTrivia.answer}`);
      await gameMsg.edit({ embeds: [winEmbed], components: [] }).catch(() => { });
    } else {
      activeRobberGames.delete(userId);
      const currentBal = await getBalance(userId, username);
      const lostAmount = Math.floor(currentBal * 0.20);
      await updateBalance(userId, username, -lostAmount);

      const loseEmbed = new EmbedBuilder()
        .setTitle('💸 Trả Lời Sai Rồi! 💸')
        .setColor('#ED4245')
        .setDescription(`<@${userId}> đã đưa ra một đáp án sai lệch.\n\nTên cướp đã thu **${lostAmount.toLocaleString()} coins** (20% tài sản) làm phí bổ túc kiến thức.\n\n❌ **Đáp án thực sự là:** ${randomTrivia.answer}`);
      await gameMsg.edit({ embeds: [loseEmbed], components: [] }).catch(() => { });
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      activeRobberGames.delete(userId);
      const currentBal = await getBalance(userId, username);
      const lostAmount = Math.floor(currentBal * 0.30);
      await updateBalance(userId, username, -lostAmount);

      const timeoutEmbed = new EmbedBuilder()
        .setTitle('⏳ Đã Quá Thời Gian! ⏳')
        .setColor('#ED4245')
        .setDescription(`Vượt quá 15 giây quy định! Suy nghĩ lâu hay bạn đang cầu cứu Google?\n\nTên cướp mất kiên nhẫn và đã móc túi **${lostAmount.toLocaleString()} coins** (30% tài sản) của <@${userId}>.\n\n❌ **Đáp án đúng là:** ${randomTrivia.answer}`);
      await gameMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => { });
    }
  });
}
