import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
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

const MIN_HOST_BALANCE = 20000;
const GAME_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function buildBoardEmbed(game, hostId, hostName, endTime) {
  let description = `**Chủ sòng:** <@${hostId}>\n`;
  description += `**Trạng thái:** Đang nhận cược (Tự động mở bát lúc <t:${endTime}:t>)\n\n`;
  description += `*(Trúng 1 lần x1, 2 lần x2, 3 lần x3. Giải vô đền nợ, x2/miễn tử vẫn hoạt động!)*\n\n`;
  description += `**--- SÀN GIAO DỊCH ---**\n`;

  const stats = {
    bau: { total: 0, users: new Set() },
    cua: { total: 0, users: new Set() },
    tom: { total: 0, users: new Set() },
    ca: { total: 0, users: new Set() },
    ga: { total: 0, users: new Set() },
    nai: { total: 0, users: new Set() }
  };

  game.bets.forEach(b => {
    stats[b.animal].total += b.amount;
    stats[b.animal].users.add(b.username);
  });

  ANIMALS.forEach(a => {
    const userList = stats[a].users.size > 0 ? ` (${Array.from(stats[a].users).join(', ')})` : ' (0 người)';
    description += `**${EMOJIS[a]}**: ${stats[a].total.toLocaleString()} xu${userList}\n`;
  });

  return new EmbedBuilder()
    .setTitle('🎲 SÒNG BẦU CUA ĐÃ MỞ!')
    .setDescription(description)
    .setColor('#5865F2')
    .setFooter({ text: 'Người chơi dùng nút bên dưới để cược. Chủ sòng có thể Lắc / Mở!' });
}

export async function handleBauCua(message, args) {
  const channelId = message.channel.id;

  if (!args[0] || args[0].toLowerCase() !== 'start') {
    return message.reply('Sử dụng lệnh: `!bc start` để mở sòng.');
  }

  if (activeGames.has(channelId)) {
    return message.reply('Ván Bầu Cua đang diễn ra, xin vui lòng chờ đợi!');
  }

  const hostHasEnough = await checkBalance(message.author.id, message.author.username, MIN_HOST_BALANCE);
  if (!hostHasEnough) {
    return message.reply(`Bạn cần ít nhất **${MIN_HOST_BALANCE.toLocaleString()} xu** để làm chủ sòng!`);
  }

  const targetMs = Date.now() + GAME_TIMEOUT_MS;
  const endTime = Math.floor(targetMs / 1000);

  const game = {
    state: 'BETTING',
    hostId: message.author.id,
    hostName: message.author.username,
    bets: [],
    startMessage: null,
    targetMs,
    endTime,
    updatePending: false
  };

  activeGames.set(channelId, game);

  const embed = buildBoardEmbed(game, message.author.id, message.author.username, endTime);

  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();
  const row3 = new ActionRowBuilder();

  ANIMALS.forEach((animal, idx) => {
    const btn = new ButtonBuilder()
      .setCustomId(`bet_bc_${animal}`)
      .setLabel(LABELS[animal])
      .setEmoji(ICONS[animal])
      .setStyle(ButtonStyle.Primary);

    if (idx < 3) row1.addComponents(btn);
    else row2.addComponents(btn);
  });

  row3.addComponents(
    new ButtonBuilder()
      .setCustomId('bc_host_open')
      .setLabel('Mở Bát')
      .setEmoji('🔥')
      .setStyle(ButtonStyle.Success)
  );

  const startMsg = await message.channel.send({ embeds: [embed], components: [row1, row2, row3] });
  game.startMessage = startMsg;

  // Auto-update UI interval
  const updateUiInterval = setInterval(() => {
    const cg = activeGames.get(channelId);
    if (!cg || cg.state !== 'BETTING') {
      clearInterval(updateUiInterval);
      return;
    }
    if (cg.updatePending) {
      const newEmbed = buildBoardEmbed(cg, cg.hostId, cg.hostName, cg.endTime);
      cg.startMessage.edit({ embeds: [newEmbed] }).catch(() => {});
      cg.updatePending = false;
    }
  }, 2500);

  // Auto-open interval
  const timer = setInterval(() => {
    const cg = activeGames.get(channelId);
    if (!cg || cg.state !== 'BETTING') {
      clearInterval(timer);
      return;
    }
    if (Date.now() >= cg.targetMs) {
      clearInterval(timer);
      triggerOpen(channelId, message.client);
    }
  }, 1000);
}

export async function handleBauCuaInteraction(interaction) {
  const channelId = interaction.channelId;

  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId === 'bc_host_open') {
      const game = activeGames.get(channelId);
      if (!game || game.state !== 'BETTING') {
         return interaction.reply({ content: 'Sòng này đã đóng hoặc không tồn tại!', ephemeral: true });
      }
      if (interaction.user.id !== game.hostId) {
         return interaction.reply({ content: 'Chỉ có CHỦ SÒNG mới được sử dụng nút này!', ephemeral: true });
      }

      interaction.reply({ content: '🔥 Chủ sòng quyết định MỞ BÁT!', ephemeral: false }).then(msg => {
          setTimeout(() => msg.delete().catch(()=>Object), 2500);
      });
      return triggerOpen(channelId, interaction.client);
    }

    if (customId.startsWith('bet_bc_')) {
      const animal = customId.split('_')[2];
      const game = activeGames.get(channelId);
      if (!game || game.state !== 'BETTING') {
         return interaction.reply({ content: 'Đã hết thời gian đặt cược hoặc sòng không tồn tại!', ephemeral: true });
      }
      if (interaction.user.id === game.hostId) {
         return interaction.reply({ content: 'Chủ sòng không thể tự đặt cược!', ephemeral: true });
      }

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
    }
  } else if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_bc_')) {
    const game = activeGames.get(channelId);
    if (!game || game.state !== 'BETTING') {
       return interaction.reply({ content: 'Đã hết thời gian đặt cược!', ephemeral: true });
    }

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
      return interaction.reply({ content: 'Bạn không có đủ xu để đặt cược.', ephemeral: true });
    }

    // Trừ tiền cược của người chơi ngay lập tức
    await updateBalance(interaction.user.id, interaction.user.username, -amount);

    game.bets.push({
      userId: interaction.user.id,
      username: interaction.user.username,
      animal: animalName,
      amount: amount
    });
    
    game.updatePending = true;

    return interaction.reply({ content: `💸 Bạn đã đặt cược **${amount.toLocaleString()} xu** vào **${EMOJIS[animalName]}**!`, ephemeral: true });
  }
}

async function triggerOpen(channelId, client) {
  const game = activeGames.get(channelId);
  if (!game || game.state !== 'BETTING') return;
  game.state = 'ROLLING'; // Ngăn chặn sự kiện mới

  try {
    const channel = await client.channels.fetch(channelId);

    if (game.startMessage) {
      // Khóa sòng: xóa các nút bấm
      await game.startMessage.edit({ components: [] }).catch(() => {});
    }

    const rollingEmbed = new EmbedBuilder()
      .setTitle('🎲 ĐANG MỞ BÁT...')
      .setColor('#e67e22')
      .setDescription('**[ ❓ | ❓ | ❓ ]**');

    const rollingMsg = await channel.send({ embeds: [rollingEmbed] });

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    const frames = [
      '**[ 🧊 | 🧊 | 🧊 ]**\n*Lắc lắc lắc...*',
      '**[ 🎲 | 🧊 | 🎲 ]**\n*Xóc xóc xóc...*',
      '**[ ❓ | 🎲 | ❓ ]**\n*Đang mở bát...*'
    ];

    for (let i = 0; i < frames.length; i++) {
      await sleep(2000);
      rollingEmbed.setDescription(frames[i]);
      await rollingMsg.edit({ embeds: [rollingEmbed] }).catch(() => { });
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

    let hostProfit = 0;
    const userSummary = {};

    // 1st pass: Account for wins and losses
    for (const bet of game.bets) {
      if (!userSummary[bet.userId]) {
         userSummary[bet.userId] = { username: bet.username, totalWinReturn: 0, totalLostBet: 0, totalBet: 0 };
      }
      userSummary[bet.userId].totalBet += bet.amount;
      
      const count = resultCounts[bet.animal] || 0;
      if (count > 0) {
        // Return = Gốc + Lời
        const winAmt = bet.amount + (bet.amount * count); 
        userSummary[bet.userId].totalWinReturn += winAmt;
        
        // Nhà cái phải bù phần tiền lời, không bù tiền gốc (vì gốc nhà cái chưa lấy)
        hostProfit -= (bet.amount * count); 
      } else {
        userSummary[bet.userId].totalLostBet += bet.amount;
        hostProfit += bet.amount; // Nhà cái lấy tiền cược thua
      }
    }

    // 2nd pass: Apply items (x2 & Shield) and transfer money
    for (const [userId, p] of Object.entries(userSummary)) {
      if (p.totalWinReturn > 0) {
        const hasX2 = await consumeItem(userId, 'x2_reward');
        let finalReturn = p.totalWinReturn;
        if (hasX2) {
            finalReturn *= 2;
            const extra = finalReturn - p.totalWinReturn; 
            hostProfit -= extra; // Nhà cái phải ói thêm tiền túi để trả x2
            p.x2 = true;
        }
        await updateBalance(userId, p.username, finalReturn);
      }
      
      // Bùa cứu mạng chỉ kích hoạt nếu hoàn toàn trắng tay trong ván
      if (p.totalWinReturn === 0 && p.totalLostBet > 0) {
        const hasShield = await consumeItem(userId, 'bua_mien_tu');
        if (hasShield) {
            hostProfit -= p.totalLostBet; // Nhà cái không được ăn phần này
            await updateBalance(userId, p.username, p.totalLostBet);
            p.rescued = p.totalLostBet;
        }
      }
    }

    // Cập nhật lợi nhuận/lỗ cho Chủ Sòng (có thể làm balance âm)
    await updateBalance(game.hostId, game.hostName, hostProfit);

    // Chuẩn bị Text Bảng Xếp Hạng
    let summaryText = '';
    const allBettors = Object.values(userSummary);
    if (allBettors.length === 0) {
      summaryText = '*Sòng ế quá, không người chơi nào tham gia...*';
    } else {
      for (const p of allBettors) {
        let text = `👤 **${p.username}**: `;
        
        // Tiền nhận về
        let finalReturn = p.totalWinReturn;
        if (p.x2) finalReturn *= 2;
        if (p.rescued) finalReturn += p.rescued; 

        // Net = Nhận về - (Tổng các khoản đã cược)
        const net = finalReturn - p.totalBet;

        if (net > 0) {
          text += `📈 Lời +${net.toLocaleString()} xu`;
        } else if (net < 0) {
          text += `📉 Lỗ ${net.toLocaleString()} xu`;
        } else {
          text += `➖ Hòa vốn`;
        }
        if (p.x2) text += ` (💰 Vé x2)`;
        if (p.rescued) text += ` (🛡️ Bùa cứu: hoàn ${p.rescued.toLocaleString()})`;
        summaryText += `${text}\n`;
      }
    }

    const hostBalanceNow = await getBalance(game.hostId, game.hostName);
    const hostStatus = hostProfit > 0 ? `📈 Lời +${hostProfit.toLocaleString()} xu` : (hostProfit < 0 ? `📉 Lỗ ${hostProfit.toLocaleString()} xu` : `➖ 0 xu`);
    
    let hostDebtWarning = '';
    if (hostBalanceNow < 0) {
      hostDebtWarning = `\n⚠️ **CHÚ Ý:** Chủ sòng đã vỡ nợ, số dư âm: **${hostBalanceNow.toLocaleString()} xu**. Hãy đi làm nhiệm vụ trả nợ!`;
    }

    const diceStr = `**[ ${EMOJIS[results[0]]} ] | [ ${EMOJIS[results[1]]} ] | [ ${EMOJIS[results[2]]} ]**`;

    const resultEmbed = new EmbedBuilder()
      .setTitle('🎲 KẾT QUẢ SÒNG BẦU CUA')
      .setColor(hostProfit >= 0 ? '#57F287' : '#ED4245')
      .setDescription(`Kết quả xổ:\n${diceStr}\n\n**THỐNG KÊ THIỆT HẠI:**\n${summaryText}\n---\n🎩 **Chủ sòng (<@${game.hostId}>):** ${hostStatus}${hostDebtWarning}`);

    await channel.send({ embeds: [resultEmbed] });
    await rollingMsg.delete().catch(() => { });

  } catch (err) {
    console.error('Lỗi khi mở bát Bầu Cua:', err);
  } finally {
    activeGames.delete(channelId);
  }
}

