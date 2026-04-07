import { EmbedBuilder } from 'discord.js';
import { updateBalance, getWordChainHistory, saveWordChainHistory, clearWordChainHistory, saveWordChainState } from '../utils/db.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const wordsList = require('an-array-of-english-words');
const wordsSet = new Set(wordsList);

export const activeWordChains = new Map();
export const channelWordHistory = new Map();

export async function restoreActiveGames(dbDataList) {
  for (const data of dbDataList) {
    if (data.channelId.startsWith('vn_')) continue;
    
    channelWordHistory.set(data.channelId, {
       usedWords: new Set(data.usedWords || []),
       gameCount: data.gameCount || 0
    });

    const game = {
       channelId: data.channelId,
       currentLetter: data.currentLetter,
       history: channelWordHistory.get(data.channelId),
       scores: data.scores || {},
       lastUserId: data.lastUserId
    };
    activeWordChains.set(data.channelId, game);
  }
}

const EMOJI_NUMBERS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export async function handleWordChainCommand(message, args) {
  const channelId = message.channel.id;
  const action = args[0]?.toLowerCase();

  if (action === 'stop') {
    if (activeWordChains.has(channelId)) {
      activeWordChains.delete(channelId);
      saveWordChainState(channelId, { isActive: false }).catch(() => {});
      return message.reply('Đã kết thúc trò chơi Nối Từ ở phòng này. (Lịch sử các từ dùng vẫn được giữ nguyên trong DB)');
    } else {
      return message.reply('Hiện không có ván Nối Từ nào đang hoạt động ở đây.');
    }
  }

  if (action === 'start' || !action) {
    if (activeWordChains.has(channelId)) {
      return message.reply('Phòng này đang có một ván Nối Từ! Hãy tham gia bằng cách tìm từ.');
    }

    if (!channelWordHistory.has(channelId)) {
      const dbHistory = await getWordChainHistory(channelId);
      if (dbHistory) {
        channelWordHistory.set(channelId, { usedWords: new Set(dbHistory.usedWords), gameCount: dbHistory.gameCount });
      } else {
        channelWordHistory.set(channelId, { usedWords: new Set(), gameCount: 0 });
      }
    }
    const history = channelWordHistory.get(channelId);

    let startWord = '';
    while (startWord.length < 4 || history.usedWords.has(startWord)) {
      startWord = wordsList[Math.floor(Math.random() * wordsList.length)];
    }

    history.usedWords.add(startWord);

    const currentLetter = startWord[startWord.length - 1];

    const game = {
      channelId: channelId,
      currentLetter: currentLetter,
      history: history,
      scores: {},
      lastUserId: null
    };

    activeWordChains.set(channelId, game);

    saveWordChainState(channelId, {
      usedWords: Array.from(history.usedWords),
      gameCount: history.gameCount,
      isActive: true,
      currentLetter: currentLetter,
      lastUserId: null,
      scores: {}
    }).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle('Game Nối Từ Bắt Đầu!')
      .setColor('#5865F2')
      .setDescription(
        `Luật chơi: Mỗi người nhắn một từ tiếng Anh hợp lệ bắt đầu bằng chữ cái cuối cùng của từ trước đó.\nAI TÍCH LŨY ĐỦ **10 LẦN GHÉP TỪ CHO MỘT CHỮ CÁI** SẼ CHIẾN THẮNG (Phần thưởng cuối: 10,000 Coins. Thưởng lẻ: +100 coins/từ).\n\nTừ khởi đầu: **${startWord.toUpperCase()}**\n\nMời người chơi đầu tiên nhắn từ tiếp tay bắt đầu bằng chữ: **${currentLetter.toUpperCase()}**`
      );

    return message.channel.send({ embeds: [embed] });
  }

  return message.reply('Cú pháp không hợp lệ. Phải là `!noitu start` hoặc `!noitu stop`.');
}

export async function handleWordChainMessage(message) {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (content.includes(' ')) return;
  if (content.startsWith('!') || !/^[a-z]+$/.test(content)) return;

  const channelId = message.channel.id;
  const game = activeWordChains.get(channelId);

  if (!game) return;

  if (content[0] !== game.currentLetter) return;

  if (game.history.usedWords.has(content)) {
    const passed = game.history.gameCount;
    const remain = 10 - passed;
    const pastText = passed === 0 ? "ván này" : `${passed} game gần đây`;
    return message.reply(`Từ này đã được dùng trong ${pastText}, bạn có thể dùng lại sau ${remain} game nữa`);
  }

  if (game.lastUserId === message.author.id) {
    return message.react('⏳').catch(() => { });
  }

  if (!wordsSet.has(content)) {
    return message.react('❌').catch(() => { });
  }

  game.history.usedWords.add(content);
  game.lastUserId = message.author.id;

  const startChar = content[0];
  const userId = message.author.id;

  if (!game.scores[userId]) game.scores[userId] = {};
  if (!game.scores[userId][startChar]) game.scores[userId][startChar] = 0;

  game.scores[userId][startChar] += 1;
  const currentCount = game.scores[userId][startChar];

  await updateBalance(userId, message.author.username, 100);

  game.currentLetter = content[content.length - 1];

  await message.react('✅').catch(() => { });

  if (currentCount >= 10) {
    await message.react('🔟').catch(() => { });
    await message.react('🎉').catch(() => { });

    await updateBalance(userId, message.author.username, 9900);

    game.history.gameCount += 1;
    let resetMsg = '';

    if (game.history.gameCount >= 10) {
      game.history.usedWords.clear();
      game.history.gameCount = 0;
      clearWordChainHistory(channelId).catch(() => { });
      resetMsg = `\n\n🔄 **Đã đạt giới hạn 10 ván. Bộ nhớ các từ đã dùng vừa được xóa sạch!**`;
    } else {
      saveWordChainState(channelId, {
         usedWords: Array.from(game.history.usedWords),
         gameCount: game.history.gameCount,
         isActive: false
      }).catch(() => {});
      resetMsg = `\n*(Lưu ý: Các từ đã dùng ở ván này sẽ tiếp tục bị cấm ở ván sau!)*`;
    }

    const winEmbed = new EmbedBuilder()
      .setTitle('Người Chiến Thắng Nối Từ!')
      .setColor('#57F287')
      .setDescription(
        `<@${userId}> đã thành công nối đủ **10 từ tiếng Anh** bắt đầu bằng chữ cái **${startChar.toUpperCase()}**!\n\nNhận phần thưởng xứng đáng: **10,000 coins** 🎉\nTrò chơi đã kết thúc. Sử dụng \`!noitu start\` để mở lại phòng.${resetMsg}`
      );

    await message.channel.send({ embeds: [winEmbed] });

    activeWordChains.delete(channelId);
    return;
  }

  if (currentCount > 0 && currentCount < 10) {
    saveWordChainState(channelId, {
       usedWords: Array.from(game.history.usedWords),
       gameCount: game.history.gameCount,
       isActive: true,
       currentLetter: game.currentLetter,
       lastUserId: game.lastUserId,
       scores: game.scores
    }).catch(() => {});
    await message.react(EMOJI_NUMBERS[currentCount]).catch(() => { });
  }
}
