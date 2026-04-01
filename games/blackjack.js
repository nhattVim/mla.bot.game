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

function formatHand(hand, hideDealerSecondCard = false) {
  if (hideDealerSecondCard) {
    return `${hand[0].rank}${hand[0].suit} ❓`;
  }
  return hand.map(c => `${c.rank}${c.suit}`).join(' ');
}

export async function handleBlackjack(message, args) {
  if (args.length === 0) {
    return message.reply('Vui lòng nhập số tiền cược!\nVí dụ: `!bj 1000` hoặc `!bj all`');
  }

  const userId = message.author.id;
  const username = message.author.username;

  // Prevent multiple active games per user
  for (const game of activeGames.values()) {
    if (game.userId === userId) {
      return message.reply('Bạn đang dở một ván bài, hãy hoàn thành nó trước đã!');
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
    return message.reply('Bạn không có đủ xu để chơi canh bạc này!');
  }

  // Deduct bet amount immediately
  await updateBalance(userId, username, -amount);

  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];

  const pValue = getHandValue(playerHand);
  const dValue = getHandValue(dealerHand);

  // Check initial blackjack
  const isPlayerBJ = pValue === 21;
  const isDealerBJ = dValue === 21;

  if (isPlayerBJ || isDealerBJ) {
    let resultText = '';
    let resultDisplay = '';

    if (isPlayerBJ && isDealerBJ) {
      resultText = '🤝 Cả hai đều Blackjack! Hoà!';
      await updateBalance(userId, username, amount); // Refund
      resultDisplay = `Hoà nhận lại: +${amount.toLocaleString()} coins`;
    } else if (isPlayerBJ) {
      resultText = '💥 Blackjack! Bạn thắng!';
      const winAmount = amount + Math.floor(amount * 1.5); // Rate 1.5 for BJ
      await updateBalance(userId, username, winAmount);
      resultDisplay = `Thắng: +${Math.floor(amount * 1.5).toLocaleString()} coins`;
    } else {
      resultText = '💥 Dealer Blackjack! Bạn thua!';
      resultDisplay = `Thua: -${amount.toLocaleString()} coins`;
    }

    const embed = new EmbedBuilder()
      .setTitle('Blackjack')
      .setColor(isPlayerBJ && !isDealerBJ ? '#2ecc71' : (isDealerBJ && !isPlayerBJ ? '#e74c3c' : '#f1c40f'))
      .setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})\n\n${resultText}\n**${resultDisplay}**`);

    return message.reply({ embeds: [embed] });
  }

  const embed = new EmbedBuilder()
    .setTitle('Blackjack')
    .setColor('#2b2d31')
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
      embed.setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})\n\n⏳ Hết thời gian giao kèo! Bạn bị xử thua do quá chậm.\n**Thua: -${amount.toLocaleString()} coins**`);
      embed.setColor('#e74c3c');
      reply.edit({ embeds: [embed], components: [] }).catch(() => { });
    }
  }, 60000);
}

export async function handleBlackjackInteraction(interaction) {
  const game = activeGames.get(interaction.message.id);
  if (!game) {
    return interaction.reply({ content: 'Sòng bài này đã hạ màn hoặc sập!', ephemeral: true });
  }

  if (interaction.user.id !== game.userId) {
    return interaction.reply({ content: 'Không phải bài của bạn đâu, đừng nhúng tay!', ephemeral: true });
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
        .setTitle('Blackjack')
        .setColor('#e74c3c')
        .setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})\n\n💥 Player bust! Bạn thua!\n**Thua: -${amount.toLocaleString()} coins**`);

      return interaction.update({ embeds: [embed], components: [] });
    } else {
      // Đang an toàn
      const embed = new EmbedBuilder()
        .setTitle('Blackjack')
        .setColor('#2b2d31')
        .setDescription(`**Dealer:** ${formatHand(dealerHand, true)} (Tổng: ❓)\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})`);

      return interaction.update({ embeds: [embed] });
    }
  }

  if (interaction.customId === 'bj_stand') {
    activeGames.delete(interaction.message.id);

    const pValue = getHandValue(playerHand);
    let dValue = getHandValue(dealerHand);

    // Mở bài Dealer ngay lập tức và xóa nút bấm
    let embed = new EmbedBuilder()
      .setTitle('Blackjack')
      .setColor('#f39c12')
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

    if (dValue > 21) {
      resultText = '💥 Dealer bust! Bạn thắng!';
      isWin = true;
    } else if (dValue > pValue) {
      resultText = '❌ Dealer thắng! Bạn thua!';
    } else if (dValue < pValue) {
      resultText = '🎉 Bạn thắng!';
      isWin = true;
    } else {
      resultText = '🤝 Hoà!';
      isTie = true;
    }

    if (isWin) {
      await updateBalance(userId, username, amount * 2);
      resultDisplay = `Thắng: +${amount.toLocaleString()} coins`;
    } else if (isTie) {
      await updateBalance(userId, username, amount);
      resultDisplay = `Hoà nhận lại: +${amount.toLocaleString()} coins`;
    } else {
      resultDisplay = `Thua: -${amount.toLocaleString()} coins`;
    }

    embed = new EmbedBuilder()
      .setTitle('Blackjack')
      .setColor(isWin ? '#2ecc71' : (isTie ? '#f1c40f' : '#e74c3c'))
      .setDescription(`**Dealer:** ${formatHand(dealerHand)} (Tổng: ${dValue})\n**Player:** ${formatHand(playerHand)} (Tổng: ${pValue})\n\n${resultText}\n**${resultDisplay}**`);

    return interaction.message.edit({ embeds: [embed] }).catch(() => { });
  }
}
