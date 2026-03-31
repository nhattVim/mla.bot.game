import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import { createCanvas } from 'canvas'
import { getBalance, updateBalance, checkBalance, consumeItem } from '../utils/db.js'

const activeGames = new Map()

const HORSE_EMOJIS = ['🔴', '🔵', '🟢', '🟡', '🟣']
const LINE_COLORS = ['🟥', '🟦', '🟩', '🟨', '🟪']
const EMPTY_BLOCK = '⬛'
const TRACK_LENGTH = 20
const WINNING_REWARD_MULTIPLIER = 4

function drawHorseResult(winningHorseIndex) {
  const canvas = createCanvas(400, 300)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#2b2d31'
  ctx.fillRect(0, 0, 400, 300)

  ctx.fillStyle = '#4cd137'
  ctx.fillRect(100, 200, 200, 100)
  ctx.fillStyle = '#44bd32'
  ctx.fillRect(100, 190, 200, 10)

  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 5
  ctx.fillStyle = '#f1c40f'
  ctx.font = '80px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('🏆', 200, 110)
  ctx.shadowBlur = 0

  const textColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6']
  ctx.fillStyle = textColors[winningHorseIndex]
  ctx.font = 'bold 45px sans-serif'
  ctx.fillText(`NGỰA SỐ ${winningHorseIndex + 1}`, 200, 170)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 30px sans-serif'
  ctx.fillText('WINNER', 200, 250)

  return new AttachmentBuilder(canvas.toBuffer(), { name: 'horse-result.png' })
}

export async function handleHorseRacing(message, args) {
  const channelId = message.channel.id

  if (!activeGames.has(channelId)) {
    activeGames.set(channelId, { state: 'IDLE', bets: [], startMessage: null })
  }

  const game = activeGames.get(channelId)

  if (game.state !== 'IDLE') {
    return message.reply('Sàn đua đang hot, đợi ngựa cán đích hoặc cổng cược đóng rồi gõ lệnh lại bạn hiền!')
  }

  game.state = 'BETTING'
  game.bets = []

  const endTime = Math.floor(Date.now() / 1000) + 30
  const embed = new EmbedBuilder()
    .setTitle('🏁 TRƯỜNG ĐUA NGỰA MỞ CỬA 🏁')
    .setDescription(`Cổng cược sẽ đóng **<t:${endTime}:R>**!\n\n*(Tỷ lệ ăn thưởng x4)*\n**Hãy bấm vào Nút của ngựa bạn muốn cược bên dưới!**`)
    .setColor('#3498db')

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

  setTimeout(() => startRace(message.channel, channelId), 30000)
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
    if (!activeGames.has(channelId)) return interaction.reply({ content: 'Sàn đua không còn tồn tại!', ephemeral: true })

    const game = activeGames.get(channelId)
    if (game.state !== 'BETTING') return interaction.reply({ content: 'Cổng cược đã đóng lại mất rồi!', ephemeral: true })

    const horseIndex = parseInt(interaction.customId.split('_')[2], 10)
    const amountStr = interaction.fields.getTextInputValue('amount').toLowerCase()

    let amount
    if (amountStr === 'all' || amountStr === 'allin') {
      amount = await getBalance(interaction.user.id, interaction.user.username)
    } else {
      amount = parseInt(amountStr, 10)
    }

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ content: 'Bạn nhập số tiền không hợp lệ!', ephemeral: true })
    }

    const hasEnough = await checkBalance(interaction.user.id, interaction.user.username, amount)
    if (!hasEnough) {
      return interaction.reply({ content: 'Bạn không đủ tiền để cược kèo này đâu!', ephemeral: true })
    }

    await updateBalance(interaction.user.id, interaction.user.username, -amount)

    game.bets.push({
      userId: interaction.user.id,
      username: interaction.user.username,
      horseIndex: horseIndex,
      amount: amount
    })

    return interaction.reply({
      content: `💸 **<@${interaction.user.id}>** vừa đặt cược **${amount.toLocaleString()} coins** vào Ngựa số **${horseIndex + 1}** ${HORSE_EMOJIS[horseIndex]}!`,
      ephemeral: false
    })
  }
}

async function startRace(channel, channelId) {
  const game = activeGames.get(channelId)
  game.state = 'RACING'

  // Tắt nút bấm khi vô race
  if (game.startMessage) {
    await game.startMessage.edit({ components: [] }).catch(() => {})
  }

  if (game.bets.length === 0) {
    channel.send('Không có ai cược! Hủy cuộc đua.')
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

  const raceEmbed = new EmbedBuilder().setTitle('🏇 CUỘC ĐUA BẮT ĐẦU 🏇').setColor('#e74c3c').setDescription(renderTrack())

  const raceMsg = await channel.send({ embeds: [raceEmbed] })

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  let winningHorse = -1

  while (true) {
    await sleep(2000)

    let isFinished = false
    let eventLog = 'Khán giả đang hò reo cổ vũ...'

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
          eventLog = `⚡ KIẾN TẠO! Ngựa số ${i + 1} bứt tốc kinh hoàng!`
        } else if (eventType === 1) {
          step = 0
          eventLog = `💥 TAI NẠN! Ngựa số ${i + 1} bị vấp ngã mất chớn!`
        } else if (eventType === 2) {
          step = -1
          eventLog = `🌪️ LÚ LẪN! Ngựa số ${i + 1} hoảng loạn lùi về phía sau!`
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
    await raceMsg.edit({ embeds: [raceEmbed] }).catch(() => {})

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
      const loserName = game.bets.find((b) => b.userId === loserId).username
      await updateBalance(loserId, loserName, totalLost)
      rescuedStr += `🛡️ <@${loserId}> được Bùa cứu mạng, hoàn trả **${totalLost.toLocaleString()} coins**!\n`
    }
  }

  if (totalRewardStr === '') totalRewardStr = 'Trắng tay hết ráo! Không ai cược trúng ngựa vô địch 😢\n'
  if (rescuedStr !== '') totalRewardStr += `\n**DANH SÁCH BẢO HỘ LƯỚI TỬ THẦN:**\n${rescuedStr}`

  const attachment = drawHorseResult(winningHorse)

  const resultEmbed = new EmbedBuilder()
    .setTitle('🏆 CUỘC ĐUA KẾT THÚC 🏆')
    .setColor('#f1c40f')
    .setImage('attachment://horse-result.png')
    .setDescription(`**Ngựa số ${winningHorse + 1} vô địch!**\n\n**Kết quả trả thưởng:**\n${totalRewardStr}`)

  await channel.send({ embeds: [resultEmbed], files: [attachment] })

  activeGames.delete(channelId)
}
