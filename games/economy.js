import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { transferMoney } from '../utils/db.js'

export const activeAnxin = new Map();


export async function handleGive(message, args) {
  const targetUser = message.mentions.users.first()
  if (!targetUser) return message.reply('Vui lòng tag người bạn muốn cho tiền!')

  let amount = 0
  for (const arg of args) {
    const val = parseInt(arg, 10)
    if (!isNaN(val) && val > 0 && !arg.includes('<@')) {
      amount = val
      break
    }
  }

  if (amount <= 0) return message.reply('Số tiền không hợp lệ! Vui lòng nhập số tiền > 0.')
  if (targetUser.id === message.author.id) return message.reply('Bạn không thể tự cho tiền chính mình!')
  if (targetUser.bot) return message.reply('Bạn không thể cho bot tiền!')

  const result = await transferMoney(message.author.id, message.author.username, targetUser.id, targetUser.username, amount)
  if (!result.success) {
    return message.reply(`Giao dịch thất bại: ${result.message}`)
  }

  const embed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('Chuyển Tiền Thành Công')
    .setDescription(`<@${message.author.id}> đã chuyển cho <@${targetUser.id}> **${amount.toLocaleString()} coins**.\n\nSố dư khả dụng: **${result.senderBalance.toLocaleString()} coins**`)

  return message.reply({ embeds: [embed] })
}

export async function handleAnXin(message, args) {
  const targetUser = message.mentions.users.first()
  if (!targetUser) return message.reply('Vui lòng tag người bạn muốn ăn xin!')

  let amount = 0
  for (const arg of args) {
    const val = parseInt(arg, 10)
    if (!isNaN(val) && val > 0 && !arg.includes('<@')) {
      amount = val
      break
    }
  }

  if (amount <= 0) return message.reply('Số tiền không hợp lệ! Vui lòng nhập số > 0.')
  if (targetUser.id === message.author.id) return message.reply('Bạn không thể yêu cầu tiền từ chính mình.')
  if (targetUser.bot) return message.reply('Bạn không thể yêu cầu bot chuyển tiền.')

  const endTime = Math.floor(Date.now() / 1000) + 60;
  const targetMs = Date.now() + 60000;

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Yêu Cầu Chuyển Tiền')
    .setDescription(`<@${message.author.id}> đang yêu cầu <@${targetUser.id}> chuyển **${amount.toLocaleString()} coins**.\n\nYêu cầu sẽ hết hạn **<t:${endTime}:R>**!`)

  const requestId = `${message.author.id}_${targetUser.id}_${amount}_${Date.now()}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`anxin_accept_${requestId}`)
      .setLabel('Chấp nhận')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`anxin_deny_${requestId}`)
      .setLabel('Từ chối')
      .setStyle(ButtonStyle.Danger)
  )

  const sentMsg = await message.reply({ content: `<@${targetUser.id}> có một yêu cầu chuyển tiền mới!`, embeds: [embed], components: [row] })

  const timer = setInterval(() => {
    const req = activeAnxin.get(requestId);
    if (!req) {
      clearInterval(timer);
      return;
    }

    if (Date.now() >= targetMs) {
      clearInterval(timer);
      activeAnxin.delete(requestId);
      const timeoutEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setDescription(`Yêu cầu chuyển tiền của <@${message.author.id}> tới <@${targetUser.id}> đã hết hạn.`);
      sentMsg.edit({ content: '', embeds: [timeoutEmbed], components: [] }).catch(() => { });
    }
  }, 1000);

  activeAnxin.set(requestId, { timer, beggarId: message.author.id, targetId: targetUser.id, amount });
}

export async function handleAnXinInteraction(interaction) {
  const parts = interaction.customId.split('_')
  const action = parts[1] // 'accept' or 'deny'
  const requestId = parts.slice(2).join('_')
  const req = activeAnxin.get(requestId)

  if (!req) {
    return interaction.reply({ content: 'Yêu cầu ăn xin này đã hết hạn hoặc không tồn tại!', ephemeral: true })
  }

  const { beggarId, targetId, amount } = req;

  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: 'Chỉ người được yêu cầu mới có thể phản hồi.', ephemeral: true })
  }

  clearInterval(req.timer)
  activeAnxin.delete(requestId)

  const beggarUser = await interaction.client.users.fetch(beggarId).catch(() => null)
  const beggarName = beggarUser ? beggarUser.username : 'Unknown'

  if (action === 'deny') {
    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setDescription(`Yêu cầu chuyển tiền của <@${beggarId}> đã bị <@${targetId}> từ chối.`)

    return interaction.update({ content: '', embeds: [embed], components: [] })
  }

  if (action === 'accept') {
    const result = await transferMoney(targetId, interaction.user.username, beggarId, beggarName, amount)

    if (!result.success) {
      return interaction.reply({ content: `Giao dịch thất bại: ${result.message}`, ephemeral: true })
    }

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setDescription(`Thành công! <@${targetId}> đã chuyển cho <@${beggarId}> **${amount.toLocaleString()} coins**! 🎉`)

    return interaction.update({ content: '', embeds: [embed], components: [] })
  }
}
