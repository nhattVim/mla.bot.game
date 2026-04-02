import { EmbedBuilder } from 'discord.js';
import { updateBalance } from '../utils/db.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const wordsList = require('an-array-of-english-words');
const wordsSet = new Set(wordsList);

export const activeWordChains = new Map();

const EMOJI_NUMBERS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export async function handleWordChainCommand(message, args) {
  const channelId = message.channel.id;
  const action = args[0]?.toLowerCase();

  if (action === 'stop') {
    if (activeWordChains.has(channelId)) {
      activeWordChains.delete(channelId);
      return message.reply('Đã kết thúc trò chơi Nối Từ ở phòng này.');
    } else {
      return message.reply('Hiện không có ván Nối Từ nào đang hoạt động ở đây.');
    }
  }

  if (action === 'start' || !action) {
    if (activeWordChains.has(channelId)) {
      return message.reply('Phòng này đang có một ván Nối Từ! Hãy tham gia bằng cách tìm từ.');
    }

    // Lấy random 1 từ có ít nhất 4 chữ cái làm mốc
    let startWord = '';
    while (startWord.length < 4) {
      startWord = wordsList[Math.floor(Math.random() * wordsList.length)];
    }

    const currentLetter = startWord[startWord.length - 1];

    const game = {
      channelId: channelId,
      currentLetter: currentLetter,
      usedWords: new Set([startWord]),
      scores: {} // { userId: { 'a': 1, 'b': 2 } }
    };

    activeWordChains.set(channelId, game);

    const embed = new EmbedBuilder()
      .setTitle('Game Nối Từ Bắt Đầu!')
      .setColor('#5865F2')
      .setDescription(
        `Luật chơi: Mỗi người nhắn một từ tiếng Anh hợp lệ bắt đầu bằng chữ cái cuối cùng của từ trước đó.\nAI TÍCH LŨY ĐỦ **10 LẦN GHÉP TỪ CHO MỘT CHỮ CÁI** SẼ CHIẾN THẮNG (Phần thưởng: 5000 Coins).\n\nTừ khởi đầu: **${startWord.toUpperCase()}**\n\nMời người chơi đầu tiên nhắn từ tiếp tay bắt đầu bằng chữ: **${currentLetter.toUpperCase()}**`
      );

    return message.channel.send({ embeds: [embed] });
  }

  return message.reply('Cú pháp không hợp lệ. Phải là `!noitu start` hoặc `!noitu stop`.');
}

export async function handleWordChainMessage(message) {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  
  // Game nối chữ tiếng anh chỉ nên duyệt các từ đơn
  if (content.includes(' ')) return;
  // Bỏ qua các tin nhắn có dấu phẩy, các lệnh gọi bot
  if (content.startsWith('!') || !/^[a-z]+$/.test(content)) return;

  const channelId = message.channel.id;
  const game = activeWordChains.get(channelId);

  if (!game) return;

  // Chỉ bắt đầu dò khi chữ cái đầu tiên khớp currentLetter
  if (content[0] !== game.currentLetter) return;

  // Lọc từ dùng rồi
  if (game.usedWords.has(content)) {
    return message.react('🔁').catch(() => {});
  }

  // Check từ hợp lệ trong từ điển
  if (!wordsSet.has(content)) {
    return message.react('❌').catch(() => {});
  }

  // Khúc này từ hoàn toàn hợp lệ
  game.usedWords.add(content);
  
  // Gắn điểm tích lũy theo kí tự khởi đầu
  const startChar = content[0];
  const userId = message.author.id;

  if (!game.scores[userId]) game.scores[userId] = {};
  if (!game.scores[userId][startChar]) game.scores[userId][startChar] = 0;
  
  game.scores[userId][startChar] += 1;
  const currentCount = game.scores[userId][startChar];

  // Cập nhật chữ yêu cầu tiếp theo
  game.currentLetter = content[content.length - 1];

  await message.react('✅').catch(() => {});

  // Nếu bằng hoặc qua 10 là thắng!
  if (currentCount >= 10) {
    // Thả emoji ăn mừng vô câu của người thắng rồi báo game
    await message.react('🔟').catch(() => {});
    await message.react('🎉').catch(() => {});

    await updateBalance(userId, message.author.username, 5000);

    const winEmbed = new EmbedBuilder()
      .setTitle('Người Chiến Thắng Nối Từ!')
      .setColor('#57F287')
      .setDescription(
        `<@${userId}> đã thành công nối đủ **10 từ tiếng Anh** bắt đầu bằng chữ cái **${startChar.toUpperCase()}**!\n\nNhận phần thưởng xứng đáng: **5,000 coins** 🎉\nTrò chơi đã tự động thiết lập lại. Sử dụng \`!noitu start\` để mở lại phòng.`
      );

    await message.channel.send({ embeds: [winEmbed] });

    activeWordChains.delete(channelId);
    return;
  }

  // Chỉ thả số vào khi họ chưa cán mốc win
  if (currentCount > 0 && currentCount < 10) {
    await message.react(EMOJI_NUMBERS[currentCount]).catch(() => {});
  }
}
