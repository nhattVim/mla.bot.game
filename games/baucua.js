import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createCanvas } from 'canvas';
import { getBalance, updateBalance, checkBalance, consumeItem } from '../utils/db.js';

const activeGames = new Map();

const ANIMALS = ['bau', 'cua', 'tom', 'ca', 'ga', 'nai'];
const EMOJIS = {
  bau: '🎃 Bầu', cua: '🦀 Cua', tom: '🦐 Tôm',
  ca: '🐟 Cá', ga: '🐔 Gà', nai: '🦌 Nai'
};
const ICONS = {
  bau: '🎃', cua: '🦀', tom: '🦐', ca: '🐟', ga: '🐔', nai: '🦌'
};
const LABELS = {
  bau: 'BẦU', cua: 'CUA', tom: 'TÔM', ca: 'CÁ', ga: 'GÀ', nai: 'NAI'
};
const COLORS = {
  bau: '#f39c12', cua: '#e74c3c', tom: '#e67e22',
  ca: '#3498db', ga: '#f1c40f', nai: '#8e44ad'
};

function drawBauCuaResult(results) {
  const canvas = createCanvas(600, 200);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, 600, 200);

  results.forEach((animal, i) => {
    const startX = 40 + (i * 180);
    const startY = 30;

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;

    ctx.fillStyle = COLORS[animal] || '#ffffff';
    ctx.beginPath();
    ctx.roundRect(startX, startY, 150, 140, 20);
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = '70px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ICONS[animal], startX + 75, startY + 75);
  });

  return new AttachmentBuilder(canvas.toBuffer(), { name: 'baucua-result.png' });
}

export async function handleBauCua(message, args) {
  const channelId = message.channel.id;

  if (!activeGames.has(channelId)) {
    activeGames.set(channelId, { state: 'IDLE', bets: [], startMessage: null });
  }

  const game = activeGames.get(channelId);

  if (game.state !== 'IDLE') {
    return message.reply('Bình tĩnh ông giáo ơi, nhà cái đang xóc dĩa rồi, đợi xong mẻ này đã!');
  }

  game.state = 'BETTING';
  game.bets = [];

    const endTime = Math.floor(Date.now() / 1000) + 30;
    const targetMs = Date.now() + 30000;

    const embed = new EmbedBuilder()
      .setTitle('🎲 SÒNG BẦU CUA ĐÃ MỞ!')
      .setDescription(`Cổng cược sẽ đóng **<t:${endTime}:R>**!\n\n*(Mỗi con vật xuất hiện 1 lần trả thưởng x1, 2 lần x2, 3 lần x3)*\n**BẤM VÀO CÁC NÚT BÊN DƯỚI ĐỂ ĐẶT CƯỢC!**`)
      .setColor('#f1c40f');

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    ANIMALS.forEach((animal, idx) => {
      const btn = new ButtonBuilder()
          .setCustomId(`bet_bc_${animal}`)
          .setLabel(LABELS[animal])
          .setEmoji(ICONS[animal])
          .setStyle(ButtonStyle.Primary);

      if (idx < 3) row1.addComponents(btn);
      else row2.addComponents(btn);
    });

    const startMsg = await message.channel.send({ embeds: [embed], components: [row1, row2] });
    game.startMessage = startMsg;

    const timer = setInterval(() => {
      if (!activeGames.has(channelId) || activeGames.get(channelId).state !== 'BETTING') {
        clearInterval(timer);
        return;
      }
      if (Date.now() >= targetMs) {
        clearInterval(timer);
        rollDice(message.channel, channelId);
      }
    }, 1000);

    return;
}

export async function handleBauCuaInteraction(interaction) {
  if (interaction.isButton()) {
    const animal = interaction.customId.split('_')[2];

    const modal = new ModalBuilder()
      .setCustomId(`modal_bc_${animal}`)
      .setTitle(`Cược vào ${LABELS[animal]} ${ICONS[animal]}`);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel("Nhập số tiền cược (hoặc 'all' / 'allin')")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ví dụ: 5000')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(amountInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
  } else if (interaction.isModalSubmit()) {
    const channelId = interaction.channelId;
    if (!activeGames.has(channelId)) return interaction.reply({ content: 'Không tìm thấy Sòng bầu cua nào!', ephemeral: true });

    const game = activeGames.get(channelId);
    if (game.state !== 'BETTING') return interaction.reply({ content: 'Nhà cái đang lắc xúc xắc, đã hết giờ cược!', ephemeral: true });

    const animalName = interaction.customId.split('_')[2];
    const amountStr = interaction.fields.getTextInputValue('amount').toLowerCase();

    let amount;
    if (amountStr === 'all' || amountStr === 'allin') {
      amount = await getBalance(interaction.user.id, interaction.user.username);
    } else {
      amount = parseInt(amountStr, 10);
    }

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ content: 'Số tiền ảo không hợp lệ!', ephemeral: true });
    }

    const hasEnough = await checkBalance(interaction.user.id, interaction.user.username, amount);
    if (!hasEnough) {
      return interaction.reply({ content: 'Rất tiếc, bạn không đủ tiền để tham gia deal cược này!', ephemeral: true });
    }

    await updateBalance(interaction.user.id, interaction.user.username, -amount);

    game.bets.push({
      userId: interaction.user.id,
      username: interaction.user.username,
      animal: animalName,
      amount: amount
    });

    return interaction.reply({ content: `💸 **<@${interaction.user.id}>** vừa chốt deal **${amount.toLocaleString()} coins** vào **${EMOJIS[animalName]}**!`, ephemeral: false });
  }
}

async function rollDice(channel, channelId) {
  const game = activeGames.get(channelId);
  game.state = 'ROLLING';

  if (game.startMessage) {
    await game.startMessage.edit({ components: [] }).catch(() => {});
  }

  if (game.bets.length === 0) {
    channel.send('Không có khách VIP nào xuống tiền, Nhà Cái quyết định hủy sòng!');
    activeGames.delete(channelId);
    return;
  }

  const rollingEmbed = new EmbedBuilder()
    .setTitle('🎲 NHÀ CÁI ĐANG XÓC ĐĨA...')
    .setColor('#e67e22')
    .setDescription('**[ ❓ | ❓ | ❓ ]**');

  const rollingMsg = await channel.send({ embeds: [rollingEmbed] });

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const frames = [
    '**[ 🧊 | 🧊 | 🧊 ]**\n*Lắc lắc lắc...*',
    '**[ 🎲 | 🧊 | 🎲 ]**\n*Xóc xóc xóc...*',
    '**[ ❓ | 🎲 | ❓ ]**\n*Lóe sáng...*'
  ];

  for (let i = 0; i < frames.length; i++) {
    await sleep(2000);
    rollingEmbed.setDescription(frames[i]);
    await rollingMsg.edit({ embeds: [rollingEmbed] }).catch(() => {});
  }

  await sleep(2000);

  const results = [
    ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
    ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
    ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  ];

  const resultCounts = {};
  for (const res of results) {
    resultCounts[res] = (resultCounts[res] || 0) + 1;
  }

  let totalWinStr = '';
  const userWinning = {};

  for (const bet of game.bets) {
    if (resultCounts[bet.animal] > 0) {
      const multiply = resultCounts[bet.animal];
      const winAmt = bet.amount + (bet.amount * multiply);
      if (!userWinning[bet.userId]) userWinning[bet.userId] = { username: bet.username, amount: 0 };
      userWinning[bet.userId].amount += winAmt;
    }
  }

  for (const [userId, data] of Object.entries(userWinning)) {
    let finalWin = data.amount;
    const hasX2 = await consumeItem(userId, 'x2_reward');
    if (hasX2) finalWin *= 2;

    await updateBalance(userId, data.username, finalWin);
    totalWinStr += `<@${userId}> thắng đậm **${finalWin.toLocaleString()}** coins! ${hasX2 ? ' (Kích hoạt Vé x2 💰)' : ''}\n`;
  }

  const allBettors = [...new Set(game.bets.map(b => b.userId))];
  const losers = allBettors.filter(id => !userWinning[id]);

  let rescuedStr = '';
  for (const loserId of losers) {
    const hasShield = await consumeItem(loserId, 'bua_mien_tu');
    if (hasShield) {
      const totalLost = game.bets.filter(b => b.userId === loserId).reduce((sum, b) => sum + b.amount, 0);
      const loserName = game.bets.find(b => b.userId === loserId).username;

      await updateBalance(loserId, loserName, totalLost);
      rescuedStr += `🛡️ <@${loserId}> được Bùa cứu mạng, hoàn trả **${totalLost.toLocaleString()} coins**!\n`;
    }
  }

  if (totalWinStr === '') totalWinStr = 'Nhà cái húp trọn, người chơi ra đê! 😢\n';
  if (rescuedStr !== '') totalWinStr += `\n**DANH SÁCH BẢO HỘ TỬ THẦN:**\n${rescuedStr}`;

  const attachment = drawBauCuaResult(results);

  const resultEmbed = new EmbedBuilder()
    .setTitle('🎲 KẾT QUẢ BẦU CUA 🎲')
    .setColor('#2ecc71')
    .setImage('attachment://baucua-result.png')
    .setDescription(`**Bảng Vàng VIP:**\n${totalWinStr}`);

  await channel.send({ embeds: [resultEmbed], files: [attachment] });
  await rollingMsg.delete().catch(() => {});

  activeGames.delete(channelId);
}
