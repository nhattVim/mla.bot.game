import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { getBalance, updateBalance, checkBalance, consumeItem } from '../utils/db.js'

export const activeOttGames = new Map()

const CHOICES = {
  bua: { name: 'Búa', emoji: '✊', beats: 'keo' },
  bao: { name: 'Bao', emoji: '🖐️', beats: 'bua' },
  keo: { name: 'Kéo', emoji: '✌️', beats: 'bao' }
}

export async function handleOanTuTi(message, args) {
  // Lệnh: !ott @User 1000
  const targetUser = message.mentions.users.first()
  const amountStr = args[1]?.toLowerCase()

  if (!targetUser || !amountStr) {
    return message.reply('Sai cú pháp! Hãy gõ: `!ott @Người_chơi_2 <số_tiền>`')
  }

  if (targetUser.bot) return message.reply('Bạn không thể thách đấu với hệ thống!')
  if (targetUser.id === message.author.id) return message.reply('Bạn không thể tự thách đấu chính mình.')

  let amount
  if (amountStr === 'all' || amountStr === 'allin') {
    amount = await getBalance(message.author.id, message.author.username)
  } else {
    amount = parseInt(amountStr, 10)
  }

  if (isNaN(amount) || amount <= 0) {
    return message.reply('Số tiền không hợp lệ!')
  }

  // Check số dư người thách xem có đủ tiền lập phòng hay không (chưa bị trừ cho đến khi target đồng ý)
  const hasEnough = await checkBalance(message.author.id, message.author.username, amount)
  if (!hasEnough) {
    return message.reply('Bạn không có đủ xu để thách đấu.')
  }

  const gameId = Date.now().toString()

  const embed = new EmbedBuilder()
    .setTitle('⚔️ THÁCH ĐẬU OẲN TÙ TÌ ⚔️')
    .setColor('#e74c3c')
    .setDescription(
      `<@${message.author.id}> đã gửi lời thách đấu tới <@${targetUser.id}>!\n\n💰 **Tiền cược:** ${amount.toLocaleString()} coins.\n\nVui lòng chọn **Chấp nhận** hoặc **Từ chối** bên dưới.\n*(Còn lại: 60 giây)*`
    )

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ott_accept_${gameId}`).setLabel('Chấp Nhận').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ott_decline_${gameId}`).setLabel('Từ Chối').setEmoji('❌').setStyle(ButtonStyle.Danger)
  )

  const startMsg = await message.channel.send({ content: `<@${targetUser.id}>`, embeds: [embed], components: [row] })

  activeOttGames.set(gameId, {
    id: gameId,
    amount: amount,
    challenger: { id: message.author.id, name: message.author.username, choice: null, ready: false },
    target: { id: targetUser.id, name: targetUser.username, choice: null, ready: false },
    state: 'PENDING',
    message: startMsg,
    timeLeft: 60
  })

  const game = activeOttGames.get(gameId)
  game.timeout = setInterval(async () => {
    if (activeOttGames.has(gameId) && activeOttGames.get(gameId).state === 'PENDING') {
      game.timeLeft -= 5
      if (game.timeLeft <= 0) {
        clearInterval(game.timeout)
        activeOttGames.delete(gameId)
        await startMsg.edit({ components: [], content: `Đã hết thời gian phản hồi. Hủy thách đấu.`, embeds: [] }).catch(() => { })
      } else {
        const updatedEmbed = EmbedBuilder.from(startMsg.embeds[0])
        updatedEmbed.setDescription(`<@${message.author.id}> đã gửi lời thách đấu tới <@${targetUser.id}>!\n\n💰 **Tiền cược:** ${amount.toLocaleString()} coins.\n\nVui lòng chọn **Chấp nhận** hoặc **Từ chối** bên dưới.\n*(Còn lại: ${game.timeLeft} giây)*`)
        await startMsg.edit({ embeds: [updatedEmbed] }).catch(() => { })
      }
    } else {
      clearInterval(game.timeout)
    }
  }, 5000)
}

export async function handleOanTuTiInteraction(interaction) {
  if (!interaction.isButton()) return

  const customId = interaction.customId
  const parts = customId.split('_')
  const action = parts[1] // accept, decline, choose
  const gameId = parts[2]

  if (!activeOttGames.has(gameId)) {
    return interaction.reply({ content: 'Trận thách đấu này không tồn tại hoặc đã kết thúc.', ephemeral: true })
  }

  const game = activeOttGames.get(gameId)

  // Xử lý Hủy/Chấp nhận
  if (action === 'decline') {
    if (interaction.user.id !== game.target.id && interaction.user.id !== game.challenger.id) {
      return interaction.reply({ content: 'Bạn không có quyền thao tác trong trận đấu này.', ephemeral: true })
    }

    clearInterval(game.timeout)
    activeOttGames.delete(gameId)
    return interaction.update({ components: [], content: `🚫 Thách đấu đã bị hủy bởi <@${interaction.user.id}>.`, embeds: [] })
  }

  if (action === 'accept') {
    if (interaction.user.id !== game.target.id) {
      return interaction.reply({ content: 'Chỉ người được thách đấu mới có thể chấp nhận.', ephemeral: true })
    }

    // Xác nhận tiền 2 bên
    const challengerHasEnough = await checkBalance(game.challenger.id, game.challenger.name, game.amount)
    if (!challengerHasEnough) {
      clearInterval(game.timeout)
      activeOttGames.delete(gameId)
      return interaction.update({ components: [], content: `❌ Thách đấu bị hủy do người gửi không còn đủ số dư cược.`, embeds: [] })
    }

    const targetHasEnough = await checkBalance(game.target.id, game.target.name, game.amount)
    if (!targetHasEnough) {
      return interaction.reply({ content: 'Bạn không có đủ xu để chấp nhận thách đấu này.', ephemeral: true })
    }

    // Bắt đầu khóa tiền
    await updateBalance(game.challenger.id, game.challenger.name, -game.amount)
    await updateBalance(game.target.id, game.target.name, -game.amount)

    // Đổi state
    clearInterval(game.timeout)
    game.state = 'CHOOSING'

    const playingEmbed = new EmbedBuilder()
      .setTitle('✊ 🖐️ ✌️ TRẬN ĐẬU BẮT ĐẦU ✊ 🖐️ ✌️')
      .setColor('#f1c40f')
      .setDescription(`Cả 2 bên đã khóa **${game.amount.toLocaleString()} coins** vào sòng.\n\nThời gian chọn vũ khí: **15 giây**! Bấm ngay!\n(Nếu không chọn sẽ bị xử thua trắng)`)

    const choosingRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ott_choose_${gameId}_bua`).setLabel('Búa').setEmoji('✊').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ott_choose_${gameId}_bao`).setLabel('Bao').setEmoji('🖐️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ott_choose_${gameId}_keo`).setLabel('Kéo').setEmoji('✌️').setStyle(ButtonStyle.Primary)
    )

    await interaction.update({ content: '', embeds: [playingEmbed], components: [choosingRow] })

    // Viền timeout 15s xử thua AFK
    game.timeLeft = 15
    game.timeout = setInterval(() => {
      game.timeLeft -= 5
      if (game.timeLeft <= 0) {
        clearInterval(game.timeout)
        resolveAFKTimeout(gameId)
      } else {
        const embed = EmbedBuilder.from(game.message.embeds[0])
        embed.setDescription(`Cả 2 bên đã khóa **${game.amount.toLocaleString()} coins** vào sòng.\n\nThời gian chọn vũ khí: **${game.timeLeft} giây**! Bấm ngay!\n(Nếu không chọn sẽ bị xử thua trắng)`)
        game.message.edit({ embeds: [embed] }).catch(() => { })
      }
    }, 5000)
    return
  }

  // Xử lý Người chơi đang Chọn vũ khí
  if (action === 'choose') {
    const weapon = parts[3]
    let playerKey = null

    if (interaction.user.id === game.challenger.id) playerKey = 'challenger'
    else if (interaction.user.id === game.target.id) playerKey = 'target'

    if (!playerKey) {
      return interaction.reply({ content: 'Bạn không có quyền tham gia trận đấu này.', ephemeral: true })
    }

    if (game.state !== 'CHOOSING') {
      return interaction.reply({ content: 'Không trong thời gian chọn!', ephemeral: true })
    }

    if (game[playerKey].ready) {
      return interaction.reply({ content: `Bạn đã xác nhận lựa chọn.`, ephemeral: true })
    }

    game[playerKey].choice = weapon
    game[playerKey].ready = true

    await interaction.reply({ content: `✅ Đã lưu lựa chọn **${CHOICES[weapon].name}** ${CHOICES[weapon].emoji} của bạn.`, ephemeral: true })

    // Nếu cả 2 đều đã chọn bài -> chốt
    if (game.challenger.ready && game.target.ready) {
      clearInterval(game.timeout)
      resolveGame(gameId)
    }
  }
}

async function resolveAFKTimeout(gameId) {
  const game = activeOttGames.get(gameId)
  if (!game || game.state !== 'CHOOSING') return

  activeOttGames.delete(gameId)

  await game.message.edit({ components: [] }).catch(() => { })

  const cReady = game.challenger.ready
  const tReady = game.target.ready

  let resultEmbed = new EmbedBuilder().setTitle('Hết Thời Gian').setColor('#ED4245')

  if (!cReady && !tReady) {
    // Cả 2 đều AFK, Hoàn tiền
    await updateBalance(game.challenger.id, game.challenger.name, game.amount)
    await updateBalance(game.target.id, game.target.name, game.amount)
    resultEmbed.setDescription(`Cả hai người chơi đều không phản hồi! Hệ thống đã hoàn trả tiền cược.`)
  } else if (!cReady && tReady) {
    // Challenger thua AFK
    await updateBalance(game.target.id, game.target.name, game.amount * 2)
    resultEmbed.setDescription(`Xử Thua: <@${game.challenger.id}> không phản hồi!\n<@${game.target.id}> nhận được **${(game.amount * 2).toLocaleString()} coins**.`)
  } else if (cReady && !tReady) {
    // Target thua AFK
    await updateBalance(game.challenger.id, game.challenger.name, game.amount * 2)
    resultEmbed.setDescription(`Xử Thua: <@${game.target.id}> không phản hồi!\n<@${game.challenger.id}> nhận được **${(game.amount * 2).toLocaleString()} coins**.`)
  }

  await game.message.channel.send({ embeds: [resultEmbed] })
}

async function resolveGame(gameId) {
  const game = activeOttGames.get(gameId)
  game.state = 'RESOLVING'
  activeOttGames.delete(gameId)

  await game.message.edit({ components: [] }).catch(() => { })
  const cChoice = CHOICES[game.challenger.choice]
  const tChoice = CHOICES[game.target.choice]

  // Animation Xổ bài
  const frames = ['**Oẳn...**', '**Oẳn... Tù...**', '**Oẳn... Tù... Tì...**', '**Đang mở kết quả...**']

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
  let animEmbed = EmbedBuilder.from(game.message.embeds[0])

  for (const text of frames) {
    animEmbed.setDescription(text)
    await game.message.edit({ embeds: [animEmbed] }).catch(() => { })
    await sleep(1500)
  }

  // Chốt kết quả
  let winner = null
  let loser = null
  let resultText = ''
  let isTie = false

  if (game.challenger.choice === game.target.choice) {
    // Hòa: Hoàn tiền cực đẹp
    isTie = true
    await updateBalance(game.challenger.id, game.challenger.name, game.amount)
    await updateBalance(game.target.id, game.target.name, game.amount)
    resultText = `🤝 **HÒA NHAU!** Cả hai đều ra ${cChoice.emoji}!\nTiền cược đã được hoàn trả.`
  } else {
    // Check ai thắng ai bại
    if (cChoice.beats === game.target.choice) {
      winner = game.challenger
      loser = game.target
    } else {
      winner = game.target
      loser = game.challenger
    }

    let finalWinAmt = game.amount * 2
    const hasX2 = await consumeItem(winner.id, 'x2_reward')
    if (hasX2) finalWinAmt += game.amount

    await updateBalance(winner.id, winner.name, finalWinAmt)

    let rescuedStr = ''
    const hasShield = await consumeItem(loser.id, 'bua_mien_tu')
    if (hasShield) {
      const randomPercent = Math.random() * (0.7 - 0.5) + 0.5;
      const rescuedAmount = Math.floor(game.amount * randomPercent);
      await updateBalance(loser.id, loser.name, rescuedAmount)
      rescuedStr = `\n\n🛡️ **BẢO HỘ TỬ THẦN:** Bùa Miễn Tử phát huy tác dụng, hoàn trả **${rescuedAmount.toLocaleString()} coins** (tỉ lệ ${Math.floor(randomPercent * 100)}%)!`
    }

    resultText = `<@${game.challenger.id}>: **${cChoice.name}** ${cChoice.emoji}  💥VS💥  ${tChoice.emoji} **${tChoice.name}** :<@${game.target.id}>\n\n🏆 **Bên Thắng:** <@${winner.id}>\n🎉 Nhận thưởng **${finalWinAmt.toLocaleString()} coins**! ${hasX2 ? '(Vé x2 💰)' : ''}${rescuedStr}`
  }

  const finalEmbed = new EmbedBuilder()
    .setTitle('Kết Quả Oẳn Tù Tì')
    .setColor(winner ? '#57F287' : (isTie ? '#FEE75C' : '#ED4245'))
    .setDescription(resultText)

  await game.message.edit({ embeds: [finalEmbed] }).catch(() => { })
}
