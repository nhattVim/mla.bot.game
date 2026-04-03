import { EmbedBuilder } from 'discord.js';
import { updateBalance, getWordChainHistory, saveWordChainHistory, clearWordChainHistory } from '../utils/db.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const wordsList = require('../data/vn_words.json');
const wordsSet = new Set(wordsList);

// Tạo map để tra cứu tốc độ cao: Âm tiết đầu -> Danh sách từ
const syllableMap = new Map();
for (const word of wordsList) {
  const syllables = word.split(' ');
  const first = syllables[0];
  if (!syllableMap.has(first)) syllableMap.set(first, []);
  syllableMap.get(first).push(word);
}

export const activeWordChainsVn = new Map();
export const channelWordHistoryVn = new Map();

export async function handleWordChainVnCommand(message, args) {
  const channelId = message.channel.id;
  const dbChannelId = 'vn_' + channelId;
  const action = args[0]?.toLowerCase();

  if (action === 'stop') {
    if (activeWordChainsVn.has(channelId)) {
      activeWordChainsVn.delete(channelId);
      return message.reply('Đã kết thúc trò chơi Nối Từ Tiếng Việt ở phòng này. (Lịch sử vẫn được giữ nguyên trong DB)');
    } else {
      return message.reply('Hiện không có ván Nối Từ Tiếng Việt nào đang hoạt động ở đây.');
    }
  }

  if (action === 'start' || !action) {
    if (activeWordChainsVn.has(channelId)) {
      return message.reply('Phòng này đang có một ván Nối Từ Tiếng Việt! Hãy tham gia nào.');
    }

    if (!channelWordHistoryVn.has(channelId)) {
      const dbHistory = await getWordChainHistory(dbChannelId);
      if (dbHistory) {
        channelWordHistoryVn.set(channelId, { usedWords: new Set(dbHistory.usedWords), gameCount: dbHistory.gameCount });
      } else {
        channelWordHistoryVn.set(channelId, { usedWords: new Set(), gameCount: 0 });
      }
    }
    const history = channelWordHistoryVn.get(channelId);

    let startWord = '';
    // Tìm một từ random chưa dùng
    let attempts = 0;
    while (attempts < 1000) {
      const word = wordsList[Math.floor(Math.random() * wordsList.length)];
      if (!history.usedWords.has(word)) {
        startWord = word;
        break;
      }
      attempts++;
    }

    if (!startWord) {
        // Trường hợp rất hy hữu: Hết từ để random, dọn lịch sử
        history.usedWords.clear();
        clearWordChainHistory(dbChannelId).catch(() => {});
        startWord = wordsList[Math.floor(Math.random() * wordsList.length)];
    }

    history.usedWords.add(startWord);
    saveWordChainHistory(dbChannelId, Array.from(history.usedWords), history.gameCount).catch(() => {});

    const syllables = startWord.split(' ');
    const nextSyllable = syllables[1];

    const game = {
      channelId: channelId,
      currentSyllable: nextSyllable,
      history: history,
      lastUserId: null
    };

    activeWordChainsVn.set(channelId, game);

    const embed = new EmbedBuilder()
      .setTitle('Trò Chơi Nối Từ Tiếng Việt Bắt Đầu!')
      .setColor('#5865F2')
      .setDescription(
        `Luật chơi: Mỗi người nhắn một từ tiếng Việt gồm **2 âm tiết**. Âm tiết đầu tiên phải trùng với âm tiết cuối của người trước.\nPhần thưởng: +100 coins/từ hợp lệ.\n**AI ĐÁNH RA ĐƯỢC TỪ MÀ KHÔNG CÒN TỪ NÀO ĐỂ NỐI SẼ CHIẾN THẮNG VÀ NHẬN ĐƯỢC 20,000 COINS!**\n\nTừ khởi đầu: **${startWord.toUpperCase()}**\n\nMời người chơi nhắn từ tiếp theo bắt đầu bằng chữ: **${nextSyllable.toUpperCase()}**`
      );

    return message.channel.send({ embeds: [embed] });
  }

  return message.reply('Cú pháp không hợp lệ. Phải là `!noituvn start` hoặc `!noituvn stop`.');
}

export async function handleWordChainVnMessage(message) {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const dbChannelId = 'vn_' + channelId;
  const game = activeWordChainsVn.get(channelId);

  if (!game) return;

  const content = message.content.trim().toLowerCase();

  // Bỏ qua tin nhắn lệnh bot hoặc tin nhắn chỉ có 1 từ
  if (content.startsWith('!')) return;
  
  // Format check 2 âm tiết đơn giản
  const syllables = content.split(/\s+/);
  if (syllables.length !== 2) return;

  // Pattern check ký tự thuần việt, nếu có ký tự lạ (chấm, phẩy) thì skip
  if (!/^[a-zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s]+$/.test(content)) return;

  // Kiểm tra âm âm tiết đầu tiên có khớp với yêu cầu không
  if (syllables[0] !== game.currentSyllable) return;

  // Kiểm tra xem đã dùng từ này chưa
  if (game.history.usedWords.has(content)) {
    return message.react('🔁').catch(() => { });
  }

  // Chống người chơi tự nối liên tục
  if (game.lastUserId === message.author.id) {
    return message.react('⏳').catch(() => { });
  }

  // Kiểm tra từ có tồn tại trong từ điển không
  if (!wordsSet.has(content)) {
    return message.react('❌').catch(() => { });
  }

  // == TỪ CỦA NGƯỜI CHƠI HỢP LỆ ==
  game.history.usedWords.add(content);
  game.lastUserId = message.author.id;
  saveWordChainHistory(dbChannelId, Array.from(game.history.usedWords), game.history.gameCount).catch(() => {});

  const userId = message.author.id;

  // Thưởng 100 coins
  await updateBalance(userId, message.author.username, 100);
  
  // Cập nhật âm tiết tiếp theo
  const nextSyllable = syllables[1];
  game.currentSyllable = nextSyllable;
  
  // KIỂM TRA BÍ TỪ (WIN CONDITION)
  const validWordsWithNextSyllable = syllableMap.get(nextSyllable) || [];
  const isDeadEnd = !validWordsWithNextSyllable.some(w => !game.history.usedWords.has(w));

  if (isDeadEnd) {
    // Thả emoji ăn mừng vô câu chốt của người thắng
    await message.react('🏆').catch(() => { });
    await message.react('🔥').catch(() => { });

    // Cập nhật số tiền thưởng (20,000 + 100 đã cộng ở trên) = chỉ cộng thêm 19,900
    await updateBalance(userId, message.author.username, 19900);

    game.history.gameCount += 1;
    let resetMsg = '';
    
    if (game.history.gameCount >= 10) {
        game.history.usedWords.clear();
        game.history.gameCount = 0;
        clearWordChainHistory(dbChannelId).catch(() => {});
        resetMsg = `\n\n🔄 **Đã đạt giới hạn 10 ván. Bộ nhớ các từ đã dùng vừa được xóa sạch!**`;
    } else {
        saveWordChainHistory(dbChannelId, Array.from(game.history.usedWords), game.history.gameCount).catch(() => {});
        resetMsg = `\n*(Lưu ý: Các từ đã dùng ở ván này sẽ tiếp tục bị cấm ở ván sau!)*`;
    }

    const winEmbed = new EmbedBuilder()
      .setTitle('💥 Tuyệt Đỉnh Nối Từ!')
      .setColor('#FFD700')
      .setDescription(
        `<@${userId}> đã tung ra từ chốt hạ: **${content.toUpperCase()}**!\nKhông còn từ nào trong từ điển bắt đầu bằng **${nextSyllable.toUpperCase()}** có thể ghép. \n\n<@${userId}> chính thức **CHIẾN THẮNG** và nhận phần thưởng khổng lồ: **20,000 coins** 🏆\nTrò chơi đã kết thúc. Sử dụng \`!noituvn start\` để bắt đầu ván mới.${resetMsg}`
      );

    await message.channel.send({ embeds: [winEmbed] });
    activeWordChainsVn.delete(channelId);
    return;
  } else {
    // Nếu chưa win, chỉ thả react OK
    await message.react('✅').catch(() => { });
  }
}
