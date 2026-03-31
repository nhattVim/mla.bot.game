import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { transferMoney } from '../utils/db.js'

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
    .setColor('#f1c40f')
    .setTitle('💸 CHUYỂN TIỀN THÀNH CÔNG')
    .setDescription(`<@${message.author.id}> đã hào phóng tặng cho <@${targetUser.id}> **${amount.toLocaleString()} coins**!\n\nSố dư của bạn: **${result.senderBalance.toLocaleString()} coins**`)

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

  if (amount <= 0) return message.reply('Số tiền xin không hợp lệ! Xin thì cũng phải ra dáng, nhập số > 0 nhé.')
  if (targetUser.id === message.author.id) return message.reply('Tự ăn xin chính mình à? Đừng tự kỷ thế!')
  if (targetUser.bot) return message.reply('Bot nghèo lắm, không cho tiền đâu!')

  const embed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle('🥺 CÓ NGƯỜI ĐANG ĂN XIN')
    .setDescription(`<@${message.author.id}> đang khóc lóc van xin đại gia <@${targetUser.id}> bố thí cho **${amount.toLocaleString()} coins**.\n\nĐại gia <@${targetUser.id}> có rủ lòng thương không?`)

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`anxin_accept_${message.author.id}_${targetUser.id}_${amount}`)
      .setLabel('Từ Thiện')
      .setEmoji('💸')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`anxin_deny_${message.author.id}_${targetUser.id}_${amount}`)
      .setLabel('Cút')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  )

  return message.reply({ content: `<@${targetUser.id}>, bạn có người ăn xin kìa!`, embeds: [embed], components: [row] })
}

export async function handleAnXinInteraction(interaction) {
  const parts = interaction.customId.split('_')
  const action = parts[1] // 'accept' or 'deny'
  const beggarId = parts[2]
  const targetId = parts[3]
  const amount = parseInt(parts[4], 10)

  // Only the person being begged can interact
  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: 'Không phải người bị xin, đừng xía vào!', ephemeral: true })
  }

  const beggarUser = await interaction.client.users.fetch(beggarId).catch(() => null)
  const beggarName = beggarUser ? beggarUser.username : 'Unknown'

  if (action === 'deny') {
    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setDescription(`Yêu cầu ăn xin của <@${beggarId}> đã bị đại gia <@${targetId}> ngó lơ một cách phũ phàng! 🥶`)
    
    return interaction.update({ content: '', embeds: [embed], components: [] })
  }

  if (action === 'accept') {
    const result = await transferMoney(targetId, interaction.user.username, beggarId, beggarName, amount)
    
    if (!result.success) {
      return interaction.reply({ content: `Giao dịch thất bại: ${result.message}`, ephemeral: true })
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setDescription(`Tuyệt vời! Đại gia <@${targetId}> đã rủ lòng thương hào phóng cho <@${beggarId}> **${amount.toLocaleString()} coins**! 🎉`)

    return interaction.update({ content: '', embeds: [embed], components: [] })
  }
}
