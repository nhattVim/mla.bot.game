import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getBalance, updateBalance } from '../utils/db.js';

const activeGames = new Map();

const suits = ['♥️', '♦️', '♣️', '♠️'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
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
  if (hand.length === 5 && getHandValue(hand) <= 21) return { type: 'NGULINH', rank: 1, mult: 3 };
  return { type: 'NORMAL', rank: 0, mult: 1 };
}

function formatHand(hand, hideDealerSecondCard = false) {
  if (hideDealerSecondCard) {
    return `${hand[0].rank}${hand[0].suit} ❓`;
  }
  return hand.map(c => `${c.rank}${c.suit}`).join(' ');
}

export async function handleBlackjack(message, args) {
  if (args.length === 0) {
    return message.reply('Vui lòng nhập số tiền cược!\nVí dụ: `!xd 1000` hoặc `!xd all`');
  }

  const userId = message.author.id;
  const username = message.author.username;

  // Prevent multiple active games per user
  for (const game of activeGames.values()) {
    if (game.userId === userId) {
      return message.reply('Bạn đang tham gia một ván Xì Dách chưa kết thúc!');
    }
  }

  const amountStr = args[0].toLowerCase();
  let amount;
  if (amountStr === 'all' || amountStr === 'allin') {
    amount = await getBalance(userId, username);
  } else {
    amount = parseInt(amountStr, 10);
  }

  if (isNaN(amount) || amount <= 0) {
    return message.reply('Số tiền cược không hợp lệ!');
  }

  const currentBalance = await getBalance(userId, username);
  if (currentBalance < amount) {
    return message.reply('Bạn không có đủ xu để tham gia ván Xì Dách này!');
  }

  // Deduct bet amount immediately
  await updateBalance(userId, username, -amount);

  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];

  const pValue = getHandValue(playerHand);
  const dValue = getHandValue(dealerHand);

  // Check initial special win (Xì Bàn, Xì Dách)
  const pSpecial = checkSpecialHand(playerHand);
  const dSpecial = checkSpecialHand(dealerHand);

  if (pSpecial.rank >= 2 || dSpecial.rank >= 2) {
    let resultText = '';
    let resultDisplay = '';

    if (pSpecial.rank === dSpecial.rank) {
      resultText = `🤝 Cả hai đều có ${pSpecial.type === 'XIBAN' ? 'Xì Vàng' : 'Xì Dách'}! Hoà cược!`;
      await updateBalance(userId, username, amount); // Refund
      resultDisplay = `Hoà nhận lại: +${amount.toLocaleString()} coins`;
    } else if (pSpecial.rank > dSpecial.rank) {
      const typeName = pSpecial.type === 'XIBAN' ? 'Xì Vàng' : 'Xì Dách';
      resultText = `💥 **${typeName}!** Đỏ quá! Bạn thắng!`;
      const pWinAmt = amount + (amount * pSpecial.mult);
      await updateBalance(userId, username, pWinAmt);
      resultDisplay = `Thắng: +${(amount * pSpecial.mult).toLocaleString()} coins${pSpecial.mult > 1 ? ` (Lãi x${pSpecial.mult})` : ''}`;
    } else {
      const typeName = dSpecial.type === 'XIBAN' ? 'Xì Vàng' : 'Xì Dách';
      const dMult = dSpecial.mult;
      resultText = `💥 Dealer có **${typeName}**! Bạn thua đứt ruột!`;

      const extraDeduct = amount * (dMult - 1);
      if (extraDeduct > 0) {
        await updateBalance(userId, username, -extraDeduct);
      }
      resultDisplay = `Thua đau: -${(amount * dMult).toLocaleString()} coins (Đền x${dMult})`;
    }

    const embed = new EmbedBuilder()
      .setTitle('Xì Dách')
      .setColor(pSpecial.rank > dSpecial.rank ? '#57F287' : (pSpecial.rank < dSpecial.rank ? '#ED4245' : '#FEE75C'))
      .setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})\n\n${resultText}\n**${resultDisplay}**`);

    return message.reply({ embeds: [embed] });
  }

  const embed = new EmbedBuilder()
    .setTitle('Xì Dách')
    .setColor('#5865F2')
    .setDescription(`**Dealer:** ${formatHand(dealerHand, true)} (Tổng: ❓)\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bj_hit')
      .setLabel('Hit')
      .setEmoji('👊')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('bj_stand')
      .setLabel('Stand')
      .setEmoji('🚫')
      .setStyle(ButtonStyle.Danger)
  );

  const reply = await message.reply({ embeds: [embed], components: [row] });

  activeGames.set(reply.id, {
    userId,
    username,
    amount,
    deck,
    playerHand,
    dealerHand,
    messageId: reply.id
  });

  // Timeout sau 60s
  setTimeout(() => {
    if (activeGames.has(reply.id)) {
      activeGames.delete(reply.id);
      embed.setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})\n\n⏳ Hết thời gian giao dịch! Bạn bị xử thua do không phản hồi.\n**Thua: -${amount.toLocaleString()} coins**`);
      embed.setColor('#ED4245');
      reply.edit({ embeds: [embed], components: [] }).catch(() => { });
    }
  }, 60000);
}

export async function handleBlackjackInteraction(interaction) {
  const game = activeGames.get(interaction.message.id);
  if (!game) {
    return interaction.reply({ content: 'Ván bài Xì Dách này đã kết thúc!', ephemeral: true });
  }

  if (interaction.user.id !== game.userId) {
    return interaction.reply({ content: 'Chỉ người tạo ván bài mới có quyền thao tác!', ephemeral: true });
  }

  const { deck, playerHand, dealerHand, amount, username, userId } = game;

  if (interaction.customId === 'bj_hit') {
    playerHand.push(deck.pop());
    const pValue = getHandValue(playerHand);

    if (pValue > 21) {
      // Bust
      activeGames.delete(interaction.message.id);
      const dValue = getHandValue(dealerHand);

      const embed = new EmbedBuilder()
        .setTitle('Xì Dách')
        .setColor('#ED4245')
        .setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})\n\n💥 QUẮC (Bust)! Bạn đã quá 21!\n**Thua: -${amount.toLocaleString()} coins**`);

      return interaction.update({ embeds: [embed], components: [] });
    }

    // Đang an toàn
    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bj_hit')
        .setLabel('Hit')
        .setEmoji('👊')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('bj_stand')
        .setLabel('Stand')
        .setEmoji('🚫')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle('Xì Dách')
      .setColor('#5865F2')
      .setDescription(`**Dealer:** ${formatHand(dealerHand, true)} (Tổng: ❓)\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})`);

    return interaction.update({ embeds: [embed], components: [newRow] });
  }

  if (interaction.customId === 'bj_stand') {
    activeGames.delete(interaction.message.id);

    const pValue = getHandValue(playerHand);
    let dValue = getHandValue(dealerHand);

    // Mở bài Dealer ngay lập tức và xóa nút bấm
    let embed = new EmbedBuilder()
      .setTitle('Xì Dách')
      .setColor('#5865F2')
      .setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})`);

    await interaction.update({ embeds: [embed], components: [] });

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Lặp để rút bài cho Dealer (có delay)
    while (dValue < 17) {
      await sleep(1500);
      dealerHand.push(deck.pop());
      dValue = getHandValue(dealerHand);

      embed.setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})`);
      await interaction.message.edit({ embeds: [embed] }).catch(() => { });
    }

    await sleep(1000); // Dừng xíu cho kịch tính trước khi báo giá

    let resultText = '';
    let resultDisplay = '';
    let isWin = false;
    let isTie = false;
    let pWinMultiplier = 1;
    let dWinMultiplier = 1;

    const isPlayerNguLinh = playerHand.length >= 5 && pValue <= 21;
    const isDealerNguLinh = dealerHand.length >= 5 && dValue <= 21;

    if (isPlayerNguLinh && isDealerNguLinh) {
      if (pValue < dValue) {
        resultText = '🎉 Cả hai đều Ngũ Linh, nhưng bạn điểm nhỏ hơn! Bạn thắng!';
        isWin = true;
        pWinMultiplier = 3;
      } else if (pValue > dValue) {
        resultText = '💥 Cả hai đều Ngũ Linh, nhưng Dealer điểm nhỏ hơn! Bạn thua!';
        dWinMultiplier = 3;
      } else {
        resultText = '🤝 Cả hai đều Ngũ Linh và bằng điểm! Hoà!';
        isTie = true;
      }
    } else if (isPlayerNguLinh) {
      resultText = '🎉 Bạn có Ngũ Linh! Thắng đậm!';
      isWin = true;
      pWinMultiplier = 3;
    } else if (isDealerNguLinh) {
      resultText = '💥 Dealer có Ngũ Linh! Bạn thua đậm!';
      dWinMultiplier = 3;
    } else if (dValue > 21) {
      resultText = '💥 Dealer Quắc! Bạn thắng!';
      isWin = true;
    } else if (dValue > pValue) {
      resultText = '💥 Dealer lớn điểm hơn! Bạn thua!';
    } else if (dValue < pValue) {
      resultText = '🎉 Bạn thắng!';
      isWin = true;
    } else {
      resultText = '🤝 Hoà!';
      isTie = true;
    }

    if (isWin) {
      await updateBalance(userId, username, amount + (amount * pWinMultiplier));
      resultDisplay = `Thắng: +${(amount * pWinMultiplier).toLocaleString()} coins${pWinMultiplier > 1 ? ` (Lãi x${pWinMultiplier})` : ''}`;
    } else if (isTie) {
      await updateBalance(userId, username, amount);
      resultDisplay = `Hoà nhận lại: +${amount.toLocaleString()} coins`;
    } else {
      const extraDeduct = amount * (dWinMultiplier - 1);
      if (extraDeduct > 0) {
        await updateBalance(userId, username, -extraDeduct);
      }
      resultDisplay = `Thua: -${(amount * dWinMultiplier).toLocaleString()} coins${dWinMultiplier > 1 ? ` (Đền x${dWinMultiplier})` : ''}`;
    }

    embed = new EmbedBuilder()
      .setTitle('Xì Dách')
      .setColor(isWin ? '#57F287' : (isTie ? '#FEE75C' : '#ED4245'))
      .setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})\n\n${resultText}\n**${resultDisplay}**`);

    return interaction.message.edit({ embeds: [embed] }).catch(() => { });
  }
}
