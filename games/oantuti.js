import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getBalance, updateBalance, checkBalance, consumeItem } from '../utils/db.js';

export const activeOttGames = new Map();

const CHOICES = {
  bua: { name: 'Búa', emoji: '✊', beats: 'keo' },
  bao: { name: 'Bao', emoji: '🖐️', beats: 'bua' },
  keo: { name: 'Kéo', emoji: '✌️', beats: 'bao' }
};

export async function handleOanTuTi(message, args) {
  // Lệnh: !ott @User 1000
  const targetUser = message.mentions.users.first();
  const amountStr = args[1]?.toLowerCase();

  if (!targetUser || !amountStr) {
    return message.reply('Sai cú pháp! Hãy gõ: `!ott @Người_chơi_2 <số_tiền>`');
  }

  if (targetUser.bot) return message.reply('Đừng gạ gẫm tui! Tui là Máy nên lúc nào cũng thắng ráng chịu đó kề!');
  if (targetUser.id === message.author.id) return message.reply('Tự kỷ à? Đánh với người khác đi bro!');

  let amount;
  if (amountStr === 'all' || amountStr === 'allin') {
    amount = await getBalance(message.author.id, message.author.username);
  } else {
    amount = parseInt(amountStr, 10);
  }

  if (isNaN(amount) || amount <= 0) {
    return message.reply('Số tiền không hợp lệ!');
  }

  // Check số dư người thách xem có đủ tiền lập phòng hay không (chưa bị trừ cho đến khi target đồng ý)
  const hasEnough = await checkBalance(message.author.id, message.author.username, amount);
  if (!hasEnough) {
    return message.reply('Nghèo mà bày đặt thách đấu! Bạn không đủ tiền trong ví.');
  }

  const gameId = Date.now().toString();

  const embed = new EmbedBuilder()
    .setTitle('⚔️ THÁCH ĐẬU OẲN TÙ TÌ ⚔️')
    .setColor('#e74c3c')
    .setDescription(`<@${message.author.id}> đang gạ kèo đấm nhau với <@${targetUser.id}>!\n\n💰 **Tiền cược:** ${amount.toLocaleString()} coins.\n*(Số tiền sẽ chỉ bị trừ khi được chấp nhận)*\n\nHãy bấm nút **Chấp nhận** hoặc **Từ chối** bên dưới.`);

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`ott_accept_${gameId}`)
        .setLabel('Chấp Nhận')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ott_decline_${gameId}`)
        .setLabel('Từ Chối')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

  const startMsg = await message.channel.send({ content: `<@${targetUser.id}>`, embeds: [embed], components: [row] });

  activeOttGames.set(gameId, {
    id: gameId,
    amount: amount,
    challenger: { id: message.author.id, name: message.author.username, choice: null, ready: false },
    target: { id: targetUser.id, name: targetUser.username, choice: null, ready: false },
    state: 'PENDING',
    message: startMsg,
    timeout: setTimeout(async () => {
      if (activeOttGames.has(gameId) && activeOttGames.get(gameId).state === 'PENDING') {
        activeOttGames.delete(gameId);
        await startMsg.edit({ components: [], content: `Hết giờ! Hủy kèo thách đấu do <@${targetUser.id}> không phản hồi.` }).catch(() => {});
      }
    }, 60000) 
  });
}

export async function handleOanTuTiInteraction(interaction) {
  if (!interaction.isButton()) return;
  
  const customId = interaction.customId;
  const parts = customId.split('_');
  const action = parts[1]; // accept, decline, choose
  const gameId = parts[2];
  
  if (!activeOttGames.has(gameId)) {
    return interaction.reply({ content: 'Trận thách đấu này không tốn tại hoặc đã kết thúc!', ephemeral: true });
  }

  const game = activeOttGames.get(gameId);

  // Xử lý Hủy/Chấp nhận
  if (action === 'decline') {
    if (interaction.user.id !== game.target.id && interaction.user.id !== game.challenger.id) {
      return interaction.reply({ content: 'Bạn không phải người trong cuộc!', ephemeral: true });
    }
    
    clearTimeout(game.timeout);
    activeOttGames.delete(gameId);
    return interaction.update({ components: [], content: `🚫 Kèo thách đấu đã bị hủy bởi <@${interaction.user.id}>.`, embeds: [] });
  }

  if (action === 'accept') {
    if (interaction.user.id !== game.target.id) {
      return interaction.reply({ content: 'Chỉ có người bị thách đấu mới được ấn nút này!', ephemeral: true });
    }

    // Xác nhận tiền 2 bên
    const challengerHasEnough = await checkBalance(game.challenger.id, game.challenger.name, game.amount);
    if (!challengerHasEnough) {
      clearTimeout(game.timeout);
      activeOttGames.delete(gameId);
      return interaction.update({ components: [], content: `❌ Kèo bị hủy vì **thằng thách đấu** (<@${game.challenger.id}>) đã đốt sạch tiền ở trò khác rồi! 🤷‍♂️`, embeds: [] });
    }
    
    const targetHasEnough = await checkBalance(game.target.id, game.target.name, game.amount);
    if (!targetHasEnough) {
      return interaction.reply({ content: 'Khách yêu ơi, nạp thêm tiền đi, không đủ cược rồi!', ephemeral: true });
    }

    // Bắt đầu khóa tiền
    await updateBalance(game.challenger.id, game.challenger.name, -game.amount);
    await updateBalance(game.target.id, game.target.name, -game.amount);
    
    // Đổi state
    clearTimeout(game.timeout);
    game.state = 'CHOOSING';

    const playingEmbed = new EmbedBuilder()
      .setTitle('✊ 🖐️ ✌️ TRẬN ĐẬU BẮT ĐẦU ✊ 🖐️ ✌️')
      .setColor('#f1c40f')
      .setDescription(`Cả 2 bên đã khóa **${game.amount.toLocaleString()} coins** vào sòng.\n\nThời gian chọn vũ khí: **15 giây**! Bấm ngay!\n(Nếu không chọn sẽ bị xử thua trắng)`);

    const choosingRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId(`ott_choose_${gameId}_bua`).setLabel('Búa').setEmoji('✊').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ott_choose_${gameId}_bao`).setLabel('Bao').setEmoji('🖐️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ott_choose_${gameId}_keo`).setLabel('Kéo').setEmoji('✌️').setStyle(ButtonStyle.Primary)
      );

    await interaction.update({ content: '', embeds: [playingEmbed], components: [choosingRow] });
    
    // Viền timeout 15s xử thua AFK
    game.timeout = setTimeout(() => resolveAFKTimeout(gameId), 15000);
    return;
  }

  // Xử lý Người chơi đang Chọn vũ khí
  if (action === 'choose') {
    const weapon = parts[3];
    let playerKey = null;

    if (interaction.user.id === game.challenger.id) playerKey = 'challenger';
    else if (interaction.user.id === game.target.id) playerKey = 'target';
    
    if (!playerKey) {
      return interaction.reply({ content: 'Đang đấm nhau đừng vô hóng chuyện! Bạn không được chơi.', ephemeral: true });
    }

    if (game.state !== 'CHOOSING') {
      return interaction.reply({ content: 'Không trong thời gian chọn!', ephemeral: true });
    }

    if (game[playerKey].ready) {
      return interaction.reply({ content: `Bạn đã khóa vũ khí! Đừng tính đường ăn gian click lại.`, ephemeral: true });
    }

    game[playerKey].choice = weapon;
    game[playerKey].ready = true;

    await interaction.reply({ content: `✅ Bạn đã lụm **${CHOICES[weapon].name}** ${CHOICES[weapon].emoji}! Chờ đứa đối diện khui bài.`, ephemeral: true });

    // Nếu cả 2 đều đã chọn bài -> chốt
    if (game.challenger.ready && game.target.ready) {
      clearTimeout(game.timeout);
      resolveGame(gameId);
    }
  }
}

async function resolveAFKTimeout(gameId) {
  const game = activeOttGames.get(gameId);
  if (!game || game.state !== 'CHOOSING') return;

  activeOttGames.delete(gameId);
  
  await game.message.edit({ components: [] }).catch(() => {});
  
  const cReady = game.challenger.ready;
  const tReady = game.target.ready;

  let resultEmbed = new EmbedBuilder().setTitle('💤 CÓ NGƯỜI AFK!').setColor('#95a5a6');

  if (!cReady && !tReady) {
    // Cả 2 đều AFK, Hoàn tiền
    await updateBalance(game.challenger.id, game.challenger.name, game.amount);
    await updateBalance(game.target.id, game.target.name, game.amount);
    resultEmbed.setDescription(`Cả 2 tấu hài không chọn! Hệ thống đã hoàn trả cược.`);
  } else if (!cReady && tReady) {
    // Challenger thua AFK
    await updateBalance(game.target.id, game.target.name, game.amount * 2);
    resultEmbed.setDescription(`XỬ THUA: <@${game.challenger.id}> đứng như trời trồng!\n<@${game.target.id}> đương nhiên bỏ túi **${(game.amount * 2).toLocaleString()} coins** ngàn năm có một.`);
  } else if (cReady && !tReady) {
    // Target thua AFK
    await updateBalance(game.challenger.id, game.challenger.name, game.amount * 2);
    resultEmbed.setDescription(`XỬ THUA: <@${game.target.id}> ngủ quên trên bàn phím!\n<@${game.challenger.id}> húp trọn **${(game.amount * 2).toLocaleString()} coins**.`);
  }

  await game.message.channel.send({ embeds: [resultEmbed] });
}

async function resolveGame(gameId) {
  const game = activeOttGames.get(gameId);
  game.state = 'RESOLVING';
  activeOttGames.delete(gameId);
  
  await game.message.edit({ components: [] }).catch(()=>{});
  const cChoice = CHOICES[game.challenger.choice];
  const tChoice = CHOICES[game.target.choice];

  // Animation Xổ bài
  const frames = [
    '🔥 Nhận đủ Vũ Khí! **Oẳn...**',
    '🔥 Nhận đủ Vũ Khí! **Oẳn... Tù...**',
    '🔥 Nhận đủ Vũ Khí! **Oẳn... Tù... Tì...**',
    '🔥 Nhận đủ Vũ Khí! **Ra cái gì ra cái này!...**'
  ];
  
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  let animEmbed = EmbedBuilder.from(game.message.embeds[0]);

  for (const text of frames) {
    animEmbed.setDescription(text);
    await game.message.edit({ embeds: [animEmbed] }).catch(()=>{});
    await sleep(1500);
  }

  // Chốt kết quả
  let winner = null;
  let loser = null;
  let resultText = '';

  if (game.challenger.choice === game.target.choice) {
    // Hòa: Hoàn tiền cực đẹp
    await updateBalance(game.challenger.id, game.challenger.name, game.amount);
    await updateBalance(game.target.id, game.target.name, game.amount);
    resultText = `🏳️ **HÒA NHAU!** Cả 2 đều ra ${cChoice.emoji}!\nTiền cược đã được hoàn trả nguyên vẹn về 2 túi.`;
  } else {
    // Check ai thắng ai bại
    if (cChoice.beats === game.target.choice) {
      winner = game.challenger;
      loser = game.target;
    } else {
      winner = game.target;
      loser = game.challenger;
    }
    
    let finalWinAmt = game.amount * 2;
    const hasX2 = await consumeItem(winner.id, 'x2_reward');
    if (hasX2) finalWinAmt += game.amount; 
    
    await updateBalance(winner.id, winner.name, finalWinAmt);

    let rescuedStr = '';
    const hasShield = await consumeItem(loser.id, 'bua_mien_tu');
    if (hasShield) {
      await updateBalance(loser.id, loser.name, game.amount);
      rescuedStr = `\n\n🛡️ **CÔNG HIỆU BÙA CHÚ:** Khâm phục Bùa Miễn Tử của <@${loser.id}>, hoàn trả **${game.amount.toLocaleString()} coins** về két sắt!`;
    }

    resultText = `<@${game.challenger.id}>: **${cChoice.name}** ${cChoice.emoji}  💥VS💥  ${tChoice.emoji} **${tChoice.name}** :<@${game.target.id}>\n\n🏆 **Bên Thắng:** <@${winner.id}>\n💸 Lấy toàn bộ **${finalWinAmt.toLocaleString()} coins** trên giàn khoan! ${hasX2 ? '(Vé x2 💰)' : ''}${rescuedStr}`;
  }

  const finalEmbed = new EmbedBuilder()
    .setTitle('🏆 KẾT QUẢ ĐẤM NHAU OẲN TÙ TÌ 🏆')
    .setColor((winner) ? '#2ecc71' : '#f39c12')
    .setDescription(resultText);

  await game.message.edit({ embeds: [finalEmbed] }).catch(()=>{});
}
