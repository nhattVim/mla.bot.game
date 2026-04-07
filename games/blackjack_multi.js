import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getBalance, updateBalance } from '../utils/db.js';

export const activeMultiGames = new Map();

const suits = ['♥️', '♦️', '♣️', '♠️'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) { deck.push({ rank, suit }); }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function getHandValue(hand) {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    if (['J', 'Q', 'K'].includes(card.rank)) {
      value += 10;
    } else if (card.rank === 'A') {
      value += 11;
      aces += 1;
    } else {
      value += parseInt(card.rank, 10);
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }
  return value;
}

function checkSpecialHand(hand) {
  if (hand.length === 2 && hand[0].rank === 'A' && hand[1].rank === 'A') return { type: 'XIBAN', rank: 3, mult: 3 };
  if (hand.length === 2) {
    const hasAce = hand.find(c => c.rank === 'A');
    const has10 = hand.find(c => ['10', 'J', 'Q', 'K'].includes(c.rank));
    if (hasAce && has10) return { type: 'XIDACH', rank: 2, mult: 2 };
  }
  if (hand.length >= 5 && getHandValue(hand) <= 21) return { type: 'NGULINH', rank: 1, mult: 3 };
  return { type: 'NORMAL', rank: 0, mult: 1 };
}

function formatHiddenHand(hand) {
  return `🎴 `.repeat(hand.length).trim() + ` (${hand.length} lá)`;
}

function formatVisibleHand(hand) {
  if (!hand || hand.length === 0) return 'Trống';
  return hand.map(c => `${c.rank}${c.suit}`).join(' ');
}

export async function handleBlackjackMultiplayer(message, args) {
  const hostId = message.author.id;
  const username = message.author.username;

  const amountStr = args[0].toLowerCase();
  let betAmount = parseInt(amountStr, 10);
  if (isNaN(betAmount) || betAmount <= 0) {
    return message.reply('❌ Số tiền cược không hợp lệ!');
  }

  const minHostBal = 20000;
  const hostCurrentBal = await getBalance(hostId, username);
  if (hostCurrentBal < minHostBal) {
    return message.reply(`❌ Bạn cần tối thiểu **${minHostBal.toLocaleString()} coins** để làm cái! Tránh rủi ro vỡ nợ không đền nổi tiền!`);
  }

  for (const game of activeMultiGames.values()) {
    if (game.hostId === hostId || game.players.some(p => p.id === hostId)) {
      return message.reply(`❌ Bạn đang kẹt trong một phòng Xì Dách khác!`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎲 SÒNG BẠC XÌ DÁCH - Mức Cược: ${betAmount.toLocaleString()} xu`)
    .setColor('#FEE75C')
    .setDescription(`**Nhà Cái:** <@${hostId}>\n\n**Các tay chơi chờ:**\n- Chưa có ai... (0/5)\n\n*(Sòng tối đa 6 người - Giải tán sau 120s nếu không Phát Bài)*`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bjm_join').setLabel('Thuê Lỗ Cắm').setStyle(ButtonStyle.Success).setEmoji('💸'),
    new ButtonBuilder().setCustomId('bjm_leave').setLabel('Xách Dép Chạy').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bjm_start').setLabel('Phát Bài').setStyle(ButtonStyle.Primary).setEmoji('🃏')
  );

  const sent = await message.reply({ embeds: [embed], components: [row] });

  activeMultiGames.set(sent.id, {
    messageId: sent.id,
    phase: 'LOBBY',
    hostId,
    hostName: username,
    betAmount,
    players: [],
    deck: [],
    hostHand: [],
    hostValue: 0,
    turnIndex: 0,
    timeLeft: 120
  });

  const timer = setInterval(() => {
    if (activeMultiGames.has(sent.id) && activeMultiGames.get(sent.id).phase === 'LOBBY') {
      const g = activeMultiGames.get(sent.id);
      g.timeLeft -= 5;
      
      if (g.timeLeft <= 0) {
        clearInterval(timer);
        activeMultiGames.delete(sent.id);
        
        // Hoàn tiền lobby tay con
        g.players.forEach(async (p) => { await updateBalance(p.id, p.name, betAmount); });
        
        embed.setDescription(`⏳ Nhà cái <@${hostId}> ngâm quá lâu, sòng bị giải tán! Trả luân phí lại cho tay con.`);
        embed.setColor('#ED4245');
        sent.edit({ embeds: [embed], components: [] }).catch(()=>{});
      } else {
        const pList = g.players.map((p, i) => `${i+1}. <@${p.id}>`).join('\n');
        const updatedEmbed = new EmbedBuilder()
          .setTitle(`🎲 SÒNG BẠC XÌ DÁCH - Mức Cược: ${g.betAmount.toLocaleString()} xu`)
          .setColor('#FEE75C')
          .setDescription(`Nhà Cái Tay Chơi: <@${g.hostId}>\n\n**Các tay con đã lên mâm:**\n${pList || '- Chưa có ...'} (${g.players.length}/5)\n\n*(Sòng tối đa 6 người - Giải tán sau ${g.timeLeft}s nếu không Phát Bài)*`);
        sent.edit({ embeds: [updatedEmbed] }).catch(()=>{});
      }
    } else {
      clearInterval(timer);
    }
  }, 5000);
}

export async function handleBlackMultiplayerInteraction(interaction) {
  const game = activeMultiGames.get(interaction.message.id);
  if (!game) {
    return interaction.reply({ content: 'Sòng này đã bay hơi hoặc ván đã kết thúc!', ephemeral: true });
  }

  const uid = interaction.user.id;
  const uname = interaction.user.username;

  if (game.phase === 'LOBBY') {
    if (interaction.customId === 'bjm_join') {
      if (uid === game.hostId) return interaction.reply({ content: 'Làm Cái ngồi mâm riêng nhé Đại Vương!', ephemeral: true });
      if (game.players.some(p => p.id === uid)) return interaction.reply({ content: 'Bạn đã ngồi vào bàn rồi!', ephemeral: true });
      if (game.players.length >= 5) return interaction.reply({ content: 'Bàn phun 5/5 tay con!', ephemeral: true });

      const bal = await getBalance(uid, uname);
      if (bal < game.betAmount) return interaction.reply({ content: `Không đủ ${game.betAmount.toLocaleString()} để đú!`, ephemeral: true });

      await updateBalance(uid, uname, -game.betAmount);
      game.players.push({
        id: uid, name: uname, hand: [], isDone: false, doneText: '', payout: 0, netProfit: 0
      });
      await updateLobbyEmbed(interaction, game);
    }
    else if (interaction.customId === 'bjm_leave') {
      const pIdx = game.players.findIndex(p => p.id === uid);
      if (pIdx === -1) return interaction.reply({ content: 'Chưa vào mâm lấy mẹ gì rời?', ephemeral: true });
      
      await updateBalance(uid, uname, game.betAmount);
      game.players.splice(pIdx, 1);
      await updateLobbyEmbed(interaction, game);
    }
    else if (interaction.customId === 'bjm_start') {
      if (uid !== game.hostId) return interaction.reply({ content: 'Lệnh này của Cái!', ephemeral: true });
      if (game.players.length === 0) return interaction.reply({ content: 'Nhà Cái cô đơn không ai thèm chơi chung à ngài ơi rủ thêm đi!', ephemeral: true });
      
      await startDealingPhase(interaction, game);
    }
    return;
  }

  if (interaction.customId === 'bjm_peek') {
    if (uid === game.hostId) {
      if(game.hostHand.length === 0) return interaction.reply({ content: 'Chưa bốc dính bài!', ephemeral: true });
      const txt = `♠️ Bài hiện tại:\n` + formatVisibleHand(game.hostHand) + ` (Trị giá điểm: ${getHandValue(game.hostHand)})`;
      return interaction.reply({ content: `**(Bí Mật Cái)** ${txt}`, ephemeral: true });
    }
    const myPlayer = game.players.find(p => p.id === uid);
    if (!myPlayer) return interaction.reply({ content: 'Đang coi lén!', ephemeral: true });
    
    if (myPlayer.hand.length === 0) return interaction.reply({ content: 'Chưa bốc dính bài!', ephemeral: true });
    const txt = `♠️ Bài hiện tại:\n` + formatVisibleHand(myPlayer.hand) + ` (Trị giá điểm: ${getHandValue(myPlayer.hand)})`;
    return interaction.reply({ content: `**(Bí Mật Tay Con)** ${txt}`, ephemeral: true });
  }

  if (game.phase === 'PLAYBACK') {
    const isDealerTurn = game.turnIndex >= game.players.length;
    
    if (interaction.customId === 'bjm_dealer_hit' || interaction.customId === 'bjm_dealer_stand') {
      if (uid !== game.hostId) return interaction.reply({ content: 'Sân chơi của Cái dạt ra!', ephemeral: true });
      if (!isDealerTurn) return interaction.reply({ content: 'Tụ nó chưa đứt mà Đại Vương?', ephemeral: true });

      if (interaction.customId === 'bjm_dealer_hit') {
        game.hostHand.push(game.deck.pop());
        game.hostValue = getHandValue(game.hostHand);
        
        if (game.hostValue > 21) {
          return await resolveEndgameBust(interaction, game); // Busted
        }
        await updatePlayingEmbed(interaction, game);
      } else {
        if (game.hostValue < 16) {
          return interaction.reply({ content: 'Sợ gì mà chốt sớm vậy? Điểm phải >= 16 mới được dằn!', ephemeral: true });
        }
        return await resolveEndgameStand(interaction, game); // Reveal all
      }
      return;
    }

    if (interaction.customId === 'bjm_hit' || interaction.customId === 'bjm_stand') {
      if (isDealerTurn) return interaction.reply({ content: 'Đứt lượt cmnr.', ephemeral: true });
      const currentP = game.players[game.turnIndex];
      if (uid !== currentP.id) return interaction.reply({ content: `Chưa tới phiên của Bác!`, ephemeral: true });

      if (interaction.customId === 'bjm_hit') {
        currentP.hand.push(game.deck.pop());
        const pVal = getHandValue(currentP.hand);
        
        if (pVal > 21) {
          currentP.isDone = true;
          currentP.doneText = `💥 Quắc gẵy (${pVal})`;
          moveToNextTurn(game);
        } else if (currentP.hand.length >= 5 && pVal <= 21) {
          currentP.isDone = true;
          currentP.payout = game.betAmount + (game.betAmount * 3); 
          currentP.netProfit = game.betAmount * 3;
          currentP.doneText = `🎉 Ngũ Linh ĂN x3! Trả bài`;
          moveToNextTurn(game);
        }
        await updatePlayingEmbed(interaction, game);
      } else {
        const pVal = getHandValue(currentP.hand);
        if (currentP.hand.length >= 5 && pVal <= 21) {
          currentP.isDone = true;
          currentP.payout = game.betAmount + (game.betAmount * 3); 
          currentP.netProfit = game.betAmount * 3;
          currentP.doneText = `🎉 Ngũ Linh ĂN x3! Mãn nguyện`;
        } else {
           currentP.doneText = `🛑 Đã Dằn ${pVal > 15 ? pVal : '(Sức trẻ)'}`;
        }
        moveToNextTurn(game);
        await updatePlayingEmbed(interaction, game);
      }
      return;
    }
  }
}

async function updateLobbyEmbed(interaction, game) {
  const pList = game.players.map((p, i) => `${i+1}. <@${p.id}>`).join('\n');
  const embed = new EmbedBuilder()
    .setTitle(`🎲 SÒNG BẠC XÌ DÁCH - Mức Cược: ${game.betAmount.toLocaleString()} xu`)
    .setColor('#FEE75C')
    .setDescription(`Nhà Cái Tay Chơi: <@${game.hostId}>\n\n**Các tay con đã lên mâm:**\n${pList || '- Chưa có ...'} (${game.players.length}/5)\n\n*(Sòng tối đa 6 người - Giải tán sau ${game.timeLeft}s nếu không Phát Bài)*`);
  await interaction.update({ embeds: [embed] });
}

function moveToNextTurn(game) {
  game.turnIndex++;
  while (game.turnIndex < game.players.length && game.players[game.turnIndex].isDone) {
    game.turnIndex++;
  }
}

async function startDealingPhase(interaction, game) {
  game.phase = 'PLAYBACK';
  game.deck = createDeck();

  game.hostHand.push(game.deck.pop());
  game.hostHand.push(game.deck.pop());
  game.hostValue = getHandValue(game.hostHand);

  for (const p of game.players) {
    p.hand.push(game.deck.pop());
    p.hand.push(game.deck.pop());
  }

  const hostSpecial = checkSpecialHand(game.hostHand);
  
  if (hostSpecial.rank >= 2) {
    const specialStr = hostSpecial.type === 'XIBAN' ? 'XÌ VÀNG (BÀN)' : 'XÌ DÁCH';
    for (const p of game.players) {
      const pSpecial = checkSpecialHand(p.hand);
      if (pSpecial.rank === hostSpecial.rank) {
        p.payout = game.betAmount; 
        p.netProfit = 0;
        p.doneText = `🤝 HÒA (${pSpecial.type} chạm đít ${specialStr})`;
      } else if (pSpecial.type === 'XIBAN' && hostSpecial.type === 'XIDACH') {
        p.payout = game.betAmount + (game.betAmount * 3); 
        p.netProfit = game.betAmount * 3;
        p.doneText = `🎉 Cắn ngược! Lãi X3 (${pSpecial.type} cắn ${specialStr})`;
      } else {
        p.payout = 0;
        p.netProfit = -game.betAmount;
        p.doneText = `💥 CHẾT TƯƠI (${specialStr} Đè)`;
      }
      p.isDone = true;
    }
    
    return await resolveEndgameForced(interaction, game, `💥 ĐỎ MUÔN ĐỜI: Nhà cái rút sương sương ra **${specialStr}** nốc cạn mâm!`);
  } else {
    for (const p of game.players) {
      const pSpecial = checkSpecialHand(p.hand);
      if (pSpecial.rank >= 2) {
        p.payout = game.betAmount + (game.betAmount * pSpecial.mult);
        p.netProfit = game.betAmount * pSpecial.mult;
        p.doneText = `👑 Trúng lớn x${pSpecial.mult} (${pSpecial.type === 'XIBAN' ? 'Xì Vàng' : 'Xì Dách'})`;
        p.isDone = true;
      }
    }
  }

  while (game.turnIndex < game.players.length && game.players[game.turnIndex].isDone) {
    game.turnIndex++;
  }

  if (game.turnIndex >= game.players.length) {
    return await resolveEndgameForced(interaction, game, `💥 Vét trọn ổ Xì Dách đi về trong 1 nốt nhạc! Kịch Tính!`);
  }

  await updatePlayingEmbed(interaction, game);
}

async function updatePlayingEmbed(interaction, game) {
  const isDealerTurn = game.turnIndex >= game.players.length;

  let desc = `**Luật Vua:** Lãi tự động chi cho Bài Kỷ Lục. Đứt bóng thì mất xác.\n\n`;
  desc += `**🏦 Nhà Cái <@${game.hostId}>:**\n- ` + (isDealerTurn ? formatVisibleHand(game.hostHand) : formatHiddenHand(game.hostHand)) + '\n\n';

  desc += `**👥 Con Bạc:**\n`;
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    const isTurn = (!isDealerTurn && i === game.turnIndex);
    const arrow = isTurn ? '👉 ' : '';
    let handDisp = formatHiddenHand(p.hand);
    if (p.isDone || isDealerTurn) handDisp = formatVisibleHand(p.hand);
    
    let status = p.isDone ? `**[ ${p.doneText} ]**` : (isTurn ? `**[ ⏳ Tới lượt... ]**` : '');
    desc += `${arrow}<@${p.id}> : ${handDisp} ${status}\n`;
  }

  if (!isDealerTurn) {
    desc += `\n🔥 **<@${game.players[game.turnIndex].id}>, cầm Hit liền tay! Lên Ngũ Linh thì húp Cái x3!**`;
  } else {
    desc += `\n🚨 **QUYỀN SINH SÁT - ĐẾN LƯỢT ĐẠI VƯƠNG NHÀ CÁI (Dằn Từ Mốc >= 16)**`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎲 XÌ DÁCH SÒNG (${game.betAmount.toLocaleString()} đ)`)
    .setColor('#5865F2')
    .setDescription(desc);

  const row1 = new ActionRowBuilder();
  if (!isDealerTurn) {
    row1.addComponents(
      new ButtonBuilder().setCustomId('bjm_hit').setLabel('Bốc (Hit)').setStyle(ButtonStyle.Success).setEmoji('👊'),
      new ButtonBuilder().setCustomId('bjm_stand').setLabel('Dằn (Stand)').setStyle(ButtonStyle.Danger).setEmoji('🚫')
    );
  } else {
    row1.addComponents(
      new ButtonBuilder().setCustomId('bjm_dealer_hit').setLabel('Nhà Cái (Hit)').setStyle(ButtonStyle.Success).setEmoji('👊'),
      new ButtonBuilder().setCustomId('bjm_dealer_stand').setLabel('CHỐT SỔ SO BÀI').setStyle(ButtonStyle.Danger).setEmoji('🔥')
    );
  }
  
  row1.addComponents(
      new ButtonBuilder().setCustomId('bjm_peek').setLabel('Khui Lá Xem Lén').setStyle(ButtonStyle.Secondary).setEmoji('👁️')
  );

  if (interaction.replied || interaction.deferred) {
    await interaction.message.edit({ embeds: [embed], components: [row1] }).catch(()=>{});
  } else {
    await interaction.update({ embeds: [embed], components: [row1] });
  }
}

async function resolveEndgameBust(interaction, game) {
  let hostProfit = 0;
  for (const p of game.players) {
    if (!p.isDone) {
      p.isDone = true;
      p.payout = game.betAmount * 2;
      p.netProfit = game.betAmount;
      hostProfit -= game.betAmount;
      p.doneText = `🎉 Thắng Trắng (Thằng Cái Ngu)`;
    } else {
       hostProfit -= p.netProfit;
    }
  }

  await settleMoney(game, hostProfit);
  return await displayFinalBoard(interaction, game, `💥 **QUYỀN TỰ SÁT ĐÓNG DẤU (${getHandValue(game.hostHand)})!** Phát tiền đền mạng cho dân cày!!!`);
}

async function resolveEndgameStand(interaction, game) {
  let hostProfit = 0;
  const dVal = game.hostValue;
  const isDealerNguLinh = game.hostHand.length >= 5 && dVal <= 21;

  for (const p of game.players) {
    if (!p.isDone) {
      p.isDone = true;
      const pVal = getHandValue(p.hand);

      if (isDealerNguLinh) {
         p.payout = 0;
         p.netProfit = -game.betAmount;
         hostProfit += game.betAmount;
         p.doneText = `💥 Cái Ngũ Linh quật nát gạch`;
      } else if (dVal > pVal) {
         p.payout = 0;
         p.netProfit = -game.betAmount;
         hostProfit += game.betAmount;
         p.doneText = `💥 Kém tuổi (Cái ${dVal})`;
      } else if (dVal === pVal) {
         p.payout = game.betAmount;
         p.netProfit = 0;
         p.doneText = `🤝 Tình Thương Không Tưởng Cân ${dVal}`;
      } else if (dVal < pVal) {
         p.payout = game.betAmount * 2;
         p.netProfit = game.betAmount;
         hostProfit -= game.betAmount;
         p.doneText = `🎉 Thắng Nét (Phỉnh ${pVal})`;
      }
    } else {
      hostProfit -= p.netProfit;
    }
  }

  let textT = isDealerNguLinh ? `💥 NHÀ CÁI ĐẠT ĐỈNH KOW KU NGŨ LINH BĂNG CÀN !!` : `⚖️ **Giờ Phán Quyết Toàn Làng!** Cái đóng sập ${dVal} tuổi!`;
  await settleMoney(game, hostProfit);
  return await displayFinalBoard(interaction, game, textT);
}

async function resolveEndgameForced(interaction, game, reasonStr) {
  let hostProfit = 0;
  for (const p of game.players) { hostProfit -= p.netProfit; }
  await settleMoney(game, hostProfit);
  return await displayFinalBoard(interaction, game, reasonStr);
}

async function settleMoney(game, hostProfit) {
  await updateBalance(game.hostId, game.hostName, hostProfit);
  for (const p of game.players) {
    if (p.payout > 0) { await updateBalance(p.id, p.name, p.payout); }
  }
  activeMultiGames.delete(game.messageId);
}

async function displayFinalBoard(interaction, game, topStr) {
  let hostRealP = 0;
  game.players.forEach(p => hostRealP -= p.netProfit);

  let desc = `${topStr}\n\n`;
  desc += `**🏦 Cổ Cổ <@${game.hostId}>:** ${formatVisibleHand(game.hostHand)} (Đ: ${game.hostValue})\n> 💰 Doanh Thu ròng: **${hostRealP > 0 ? '+' : ''}${Math.round(hostRealP).toLocaleString()}** coins.\n\n`;

  desc += `**👥 Nghĩa Địa Thẻ Bài:**\n`;
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    desc += `- <@${p.id}>: ${formatVisibleHand(p.hand)} (Đ: ${getHandValue(p.hand)})\n   👉 **[ ${p.doneText} ]** Net: **${p.netProfit > 0 ? '+' : ''}${p.netProfit.toLocaleString()}**💲\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎲 XÌ DÁCH MỞ CỬA BÃO - HOÀN LƯƠNG`)
    .setColor('#57F287')
    .setDescription(desc);

  if (interaction.replied || interaction.deferred) {
    await interaction.message.edit({ embeds: [embed], components: [] }).catch(()=>{});
  } else {
    await interaction.update({ embeds: [embed], components: [] });
  }
}
