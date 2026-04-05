import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import { getBalance, updateBalance, checkBalance, consumeItem } from '../utils/db.js'

const activeGames = new Map()

const HORSE_EMOJIS = ['🔴', '🔵', '🟢', '🟡', '🟣']
const LINE_COLORS = ['🟥', '🟦', '🟩', '🟨', '🟪']
const EMPTY_BLOCK = '⬛'
const TRACK_LENGTH = 20
const WINNING_REWARD_MULTIPLIER = 4

export async function handleHorseRacing(message, args) {
  const channelId = message.channel.id

  if (!activeGames.has(channelId)) {
    activeGames.set(channelId, { state: 'IDLE', bets: [], startMessage: null })
  }

  const game = activeGames.get(channelId)

  if (game.state !== 'IDLE') {
    return message.reply('Trường đua đang hoạt động, xin vui lòng chờ đợi!')
  }

  game.state = 'BETTING'
  game.bets = []

  const endTime = Math.floor(Date.now() / 1000) + 30;
  const targetMs = Date.now() + 30000;

  const embed = new EmbedBuilder()
    .setTitle('Trường Đua Đã Mở')
    .setDescription(`Cổng cược sẽ đóng **<t:${endTime}:R>**!\n\n*(Tỷ lệ ăn thưởng x4)*\n**Hãy bấm vào nút của ngựa bạn muốn cược bên dưới!**`)
    .setColor('#5865F2')

  // Gắn 5 Nút ứng với 5 ngựa
  const row = new ActionRowBuilder()
  HORSE_EMOJIS.forEach((emoji, idx) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_horse_${idx}`)
        .setLabel(`Số ${idx + 1}`)
        .setEmoji(emoji)
        .setStyle(ButtonStyle.Primary)
    )
  })

  const startMsg = await message.channel.send({ embeds: [embed], components: [row] })
  game.startMessage = startMsg

  const timer = setInterval(() => {
    if (!activeGames.has(channelId) || activeGames.get(channelId).state !== 'BETTING') {
      clearInterval(timer);
      return;
    }
    if (Date.now() >= targetMs) {
      clearInterval(timer);
      startRace(message.channel, channelId);
    }
  }, 1000);

  return
}

// Hàm Xử lý Tương Tác từ index.js
export async function handleHorseRacingInteraction(interaction) {
  if (interaction.isButton()) {
    const horseIndex = interaction.customId.split('_')[2]

    // Popup Modal Nhập Cược
    const modal = new ModalBuilder().setCustomId(`modal_horse_${horseIndex}`).setTitle(`Cược Ngựa số ${parseInt(horseIndex) + 1} ${HORSE_EMOJIS[horseIndex]}`)

    const amountInput = new TextInputBuilder().setCustomId('amount').setLabel("Nhập số tiền (hoặc 'all' / 'allin')").setStyle(TextInputStyle.Short).setPlaceholder('Ví dụ: 1000').setRequired(true)

    const firstActionRow = new ActionRowBuilder().addComponents(amountInput)
    modal.addComponents(firstActionRow)

    await interaction.showModal(modal)
  } else if (interaction.isModalSubmit()) {
    const channelId = interaction.channelId
    if (!activeGames.has(channelId)) return interaction.reply({ content: 'Trường đua này không tồn tại.', ephemeral: true })

    const game = activeGames.get(channelId)
    if (game.state !== 'BETTING') return interaction.reply({ content: 'Đã hết thời gian đặt cược.', ephemeral: true })

    const horseIndex = parseInt(interaction.customId.split('_')[2], 10)
    const amountStr = interaction.fields.getTextInputValue('amount').toLowerCase()

    let amount
    if (amountStr === 'all' || amountStr === 'allin') {
      amount = await getBalance(interaction.user.id, interaction.user.username)
    } else {
      amount = parseInt(amountStr, 10)
    }

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ content: 'Số tiền không hợp lệ.', ephemeral: true })
    }

    const hasEnough = await checkBalance(interaction.user.id, interaction.user.username, amount)
    if (!hasEnough) {
      return interaction.reply({ content: 'Bạn không có đủ xu để đặt cược.', ephemeral: true })
    }

    // Chặn cược trên 3 ngựa khác nhau (Anti bao lô)
    const userBets = game.bets.filter(b => b.userId === interaction.user.id)
    const uniqueHorsesBet = new Set(userBets.map(b => b.horseIndex))
    if (uniqueHorsesBet.size >= 3 && !uniqueHorsesBet.has(horseIndex)) {
      return interaction.reply({ content: 'Bạn chỉ được phép đặt cược tối đa trên 3 con ngựa khác nhau trong một vòng đua!', ephemeral: true })
    }

    await updateBalance(interaction.user.id, interaction.user.username, -amount)

    game.bets.push({
      userId: interaction.user.id,
      username: interaction.user.username,
      horseIndex: horseIndex,
      amount: amount
    })

    return interaction.reply({
      content: `💸 **<@${interaction.user.id}>** đã đặt cược **${amount.toLocaleString()} coins** vào Ngựa số **${horseIndex + 1}** ${HORSE_EMOJIS[horseIndex]}.`,
      ephemeral: false
    })
  }
}

async function startRace(channel, channelId) {
  const game = activeGames.get(channelId)
  game.state = 'RACING'

  // Tắt nút bấm khi vô race
  if (game.startMessage) {
    await game.startMessage.edit({ components: [] }).catch(() => { })
  }

  if (game.bets.length === 0) {
    channel.send('Không có người chơi đặt cược. Hủy cuộc đua.')
    activeGames.delete(channelId)
    return
  }

  const horses = [0, 0, 0, 0, 0]

  const renderTrack = () => {
    return horses
      .map((pos, idx) => {
        const safePos = Math.min(pos, TRACK_LENGTH - 1)
        const coloredLine = LINE_COLORS[idx].repeat(safePos)
        const remainingLine = EMPTY_BLOCK.repeat(Math.max(0, TRACK_LENGTH - safePos - 1))

        return `[**${idx + 1}**] ${coloredLine}🏇${remainingLine} 🏁`
      })
      .join('\n\n')
  }

  const raceEmbed = new EmbedBuilder().setTitle('Cuộc Đua Bắt Đầu').setColor('#5865F2').setDescription(renderTrack())

  const raceMsg = await channel.send({ embeds: [raceEmbed] })

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  let winningHorse = -1

  while (true) {
    await sleep(2000)

    let isFinished = false
    let eventLog = 'Các chú ngựa đang tăng tốc...'

    const hasEvent = Math.random() < 0.3 // 30% chance for an event
    let eventHorse = -1
    let eventType = -1

    if (hasEvent) {
      eventHorse = Math.floor(Math.random() * horses.length)
      eventType = Math.floor(Math.random() * 3) // 0: Sprint, 1: Trip, 2: Confused
    }

    for (let i = 0; i < horses.length; i++) {
      let step = Math.floor(Math.random() * 3) + 1 // Nhảy 1-3 bước

      if (i === eventHorse) {
        if (eventType === 0) {
          step += 3
          eventLog = `⚡ Ngựa số ${i + 1} đang bứt tốc!`
        } else if (eventType === 1) {
          step = 0
          eventLog = `💥 Ngựa số ${i + 1} vấp ngã!`
        } else if (eventType === 2) {
          step = -1
          eventLog = `🌪️ Ngựa số ${i + 1} gặp sự cố đi lùi!`
        }
      }

      horses[i] = Math.max(0, horses[i] + step)

      if (horses[i] >= TRACK_LENGTH - 1) {
        horses[i] = TRACK_LENGTH - 1
        if (!isFinished) {
          isFinished = true
          winningHorse = i
        }
      }
    }

    raceEmbed.setDescription(`${renderTrack()}\n\n🎙️ **Bình luận trực tiếp:**\n> *${eventLog}*`)
    await raceMsg.edit({ embeds: [raceEmbed] }).catch(() => { })

    if (isFinished) break
  }

  await sleep(1000)

  let totalRewardStr = ''
  const userWinning = {}

  for (const bet of game.bets) {
    if (bet.horseIndex === winningHorse) {
      if (!userWinning[bet.userId]) userWinning[bet.userId] = { username: bet.username, amount: 0 }
      userWinning[bet.userId].amount += bet.amount * WINNING_REWARD_MULTIPLIER + bet.amount
    }
  }

  for (const [userId, data] of Object.entries(userWinning)) {
    let finalWin = data.amount
    const hasX2 = await consumeItem(userId, 'x2_reward')
    if (hasX2) finalWin *= 2
    await updateBalance(userId, data.username, finalWin)
    totalRewardStr += `<@${userId}> thắng **${finalWin.toLocaleString()}** coins! ${hasX2 ? '(Vé x2 💰)' : ''}\n`
  }

  const allBettors = [...new Set(game.bets.map((b) => b.userId))]
  const losers = allBettors.filter((id) => !userWinning[id])

  let rescuedStr = ''
  for (const loserId of losers) {
    const hasShield = await consumeItem(loserId, 'bua_mien_tu')
    if (hasShield) {
      const totalLost = game.bets.filter((b) => b.userId === loserId).reduce((sum, b) => sum + b.amount, 0)
      
      const randomPercent = Math.random() * (0.7 - 0.5) + 0.5; // 0.5 to 0.7
      const rescuedAmount = Math.floor(totalLost * randomPercent);
      const loserName = game.bets.find((b) => b.userId === loserId).username
      
      await updateBalance(loserId, loserName, rescuedAmount)
      rescuedStr += `🛡️ <@${loserId}> được Bùa cứu mạng, hoàn trả **${rescuedAmount.toLocaleString()} coins** (tỉ lệ ${Math.floor(randomPercent * 100)}%)!\n`
    }
  }

  if (totalRewardStr === '') totalRewardStr = 'Không có ai đoán trúng kết quả.\n'
  if (rescuedStr !== '') totalRewardStr += `\n**BẢO HỘ TỬ THẦN:**\n${rescuedStr}`

  const resultEmbed = new EmbedBuilder()
    .setTitle('Kết Quả Đua Ngựa')
    .setColor('#57F287')
    .setDescription(`**Ngựa số ${winningHorse + 1} vô địch!** 🏆\n\n**Kết quả trả thưởng:**\n${totalRewardStr}`)

  await channel.send({ embeds: [resultEmbed] })

  activeGames.delete(channelId)
}
