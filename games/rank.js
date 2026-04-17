import { EmbedBuilder } from 'discord.js'
import { getBalance, spendCoinsForRank, getRankData, updateRankData, getTopRanks } from '../utils/db.js'

export const RANK_NAMES = [
  'Đồng I', 'Đồng II', 'Đồng III', 'Đồng IV', 'Đồng V',
  'Bạc I', 'Bạc II', 'Bạc III', 'Bạc IV', 'Bạc V',
  'Vàng I', 'Vàng II', 'Vàng III', 'Vàng IV', 'Vàng V',
  'Quỳnh Ngọc I', 'Quỳnh Ngọc II', 'Quỳnh Ngọc III', 'Quỳnh Ngọc IV', 'Quỳnh Ngọc V',
  'Lưu Ly I', 'Lưu Ly II', 'Lưu Ly III', 'Lưu Ly IV', 'Lưu Ly V',
  'Tông Sư I', 'Tông Sư II', 'Tông Sư III', 'Tông Sư IV', 'Tông Sư V',
  'Truyền Thuyết',
  'Cái Thế Tuyệt Luân',
  'Thiên Hạ Vô Song',
  'Độc Cô Cầu Bại' // 33
]

export function getRankIcon(level) {
  if (level <= 4) return '<:a1:1493619549268873216>'
  if (level <= 9) return '<:a2:1493619577425367050>'
  if (level <= 14) return '<:a3:1493619601341157520>'
  if (level <= 19) return '<:a4:1493619630042910800>'
  if (level <= 24) return '<:a5:1493619652952068259>'
  if (level <= 29) return '<:a6:1493619676356280490>'
  return '<:a7:1493619704256925829>'
}

export const COST_TABLE = [
  // Đồng I -> V
  1000, 2000, 3000, 4000, 5000, // 0,1,2,3,4
  // Bạc I -> V
  10000, 20000, 30000, 40000, 50000, // 5,6,7,8,9
  // Vàng I -> V
  100000, 200000, 300000, 400000, 500000, // 10,11,12,13,14
  // Quỳnh Ngọc I -> V
  1000000, 2000000, 3000000, 4000000, 5000000, // 15,16,17,18,19
  // Lưu Ly I -> V
  10000000, 20000000, 30000000, 40000000, 50000000, // 20,21,22,23,24
  // Tông Sư I -> V
  100000000, 200000000, 300000000, 400000000, 500000000, // 25,26,27,28,29
  // Truyền Thuyết
  1000000000, // 30
  // Cái Thế Tuyệt Luân
  2000000000, // 31
  // Thiên Hạ Vô Song
  5000000000, // 32
  // Độc Cô Cầu Bại
  Infinity // 33
]

export async function handleRankCommand(message, args) {
  const action = args[0] ? args[0].toLowerCase() : 'info'

  if (action === 'info') {
    const rankData = await getRankData(message.author.id, message.author.username)
    const rankLevel = rankData.rankLevel
    const rankPoints = rankData.rankPoints
    const rankName = RANK_NAMES[rankLevel]
    const rankIcon = getRankIcon(rankLevel)

    let description = `Rank hiện tại: ${rankIcon} - \`${rankName}\` `

    if (rankLevel === 33) {
      description += `- \`${rankPoints.toLocaleString()} Điểm\`\n\n`
      description += `*(Bạn đã đạt đến đỉnh cao võ học. Càng nhiều điểm bảng xếp hạng càng kính nể!)*`
    } else {
      const required = COST_TABLE[rankLevel]
      const progress = ((rankPoints / required) * 100).toFixed(1)
      description += `\n\n⚡ Điểm Tích Lũy: ${rankPoints.toLocaleString()} / ${required.toLocaleString()} Điểm\n`
      description += `📈 Tiến Trình Đột Phá: ${progress}%\n\n`
      description += `*(Mục tiêu tiếp theo: ${RANK_NAMES[rankLevel + 1]})*`
    }

    const embed = new EmbedBuilder()
      .setTitle(`Hồ Sơ Xếp Hạng - ${message.author.displayName}`)
      .setThumbnail(message.author.displayAvatarURL())
      .setColor('#FFD700')
      .setDescription(description)
      .setFooter({ text: '💡 Mẹo: Dùng !rank up <số coin> để dung luyện điểm!' })

    return message.reply({ embeds: [embed] })
  }

  if (action === 'up') {
    const amountStr = args[1]?.toLowerCase()
    if (!amountStr) {
      return message.reply('Vui lòng nhập số coin muốn dung luyện! VD: `!rank up 1000` hoặc `!rank up all`')
    }

    const userBalance = await getBalance(message.author.id, message.author.username)
    let coinsToSpend = 0

    if (amountStr === 'all' || amountStr === 'allin') {
      coinsToSpend = userBalance - (userBalance % 1000)
    } else {
      const parsed = parseInt(amountStr, 10)
      if (isNaN(parsed) || parsed <= 0) {
        return message.reply('Số coin không hợp lệ.')
      }
      coinsToSpend = parsed - (parsed % 1000)
    }

    if (coinsToSpend < 1000) {
      return message.reply('Cần tối thiểu **1,000 Coins** để dung luyện thành **1 Điểm Rank**! Bạn dư coin lẻ hoặc chưa đủ.')
    }

    const tx = await spendCoinsForRank(message.author.id, message.author.username, coinsToSpend)
    if (!tx.success) {
      return message.reply(tx.message)
    }

    const pointsToAdd = coinsToSpend / 1000
    const rankData = await getRankData(message.author.id, message.author.username)

    const oldLevel = rankData.rankLevel
    let currentLevel = oldLevel
    let currentPoints = rankData.rankPoints + pointsToAdd
    let levelUpCount = 0

    while (currentLevel < 33 && currentPoints >= COST_TABLE[currentLevel]) {
      currentPoints -= COST_TABLE[currentLevel]
      currentLevel++
      levelUpCount++
    }

    await updateRankData(message.author.id, message.author.username, currentLevel, currentPoints)

    let replyMsg = `🔥 Đã tinh luyện **${coinsToSpend.toLocaleString()} Coins** thành **${pointsToAdd.toLocaleString()} Điểm**!\n`

    if (levelUpCount > 0) {
      const rankIcon = getRankIcon(currentLevel)
      replyMsg += `\n🎉 **ĐỘT PHÁ CẢNH GIỚI!** Bạn đã thăng cấp lên: ${rankIcon} **${RANK_NAMES[currentLevel]}**\n`
    }

    if (currentLevel === 33) {
      replyMsg += `\n🔮 **Tu Vi:** **${currentPoints.toLocaleString()}** Điểm`
    } else {
      const pointsNeeded = COST_TABLE[currentLevel] - currentPoints
      const coinsNeeded = pointsNeeded * 1000
      replyMsg += `\n⚡ Điểm Tích Lũy Ở Cấp Hiện Tại: **${currentPoints.toLocaleString()} / ${COST_TABLE[currentLevel].toLocaleString()}** Điểm`
      replyMsg += `\n\n📈 Cần thêm **${pointsNeeded.toLocaleString()} điểm** (${coinsNeeded.toLocaleString()} Coins) nữa để thăng cấp lên **${RANK_NAMES[currentLevel + 1]}**.`
    }

    const embed = new EmbedBuilder()
      .setTitle('Đột Phá Tu Vi')
      .setColor('#57F287')
      .setDescription(replyMsg)
      .setFooter({ text: `Số dư còn lại: ${tx.balance.toLocaleString()} Coins` })

    return message.reply({ embeds: [embed] })
  }

  if (action === 'top') {
    const topUsers = await getTopRanks(10)

    if (topUsers.length === 0) {
      return message.reply('Bảng phong thần chưa có ai vinh danh!')
    }

    let boardContent = ''
    for (let index = 0; index < topUsers.length; index++) {
      const user = topUsers[index]
      let icon = ''
      if (index === 0) icon = '🥇'
      else if (index === 1) icon = '🥈'
      else if (index === 2) icon = '🥉'
      else icon = '🏅'

      const rankLevelInfo = user.rankLevel || 0
      const rankName = RANK_NAMES[rankLevelInfo]
      const rankIcon = getRankIcon(rankLevelInfo)
      const points = (user.rankPoints || 0).toLocaleString()

      let displayName = user.username
      if (message.guild && user.userId) {
        try {
          const member = message.guild.members.cache.get(user.userId) || await message.guild.members.fetch(user.userId).catch(() => null)
          if (member) {
            displayName = member.displayName
          }
        } catch (e) {
          // ignore
        }
      }

      boardContent += `${icon} **#${index + 1} - ${displayName}**\n╰ ${rankIcon} ${rankName} - ${points} Điểm\n\n`
    }

    const embed = new EmbedBuilder()
      .setTitle('BXH Rank')
      .setColor('#2C2F33')
      .setDescription(boardContent)
      .setFooter({ text: 'Dùng !rank up để có tên trên bảng vàng!' })
      .setTimestamp()

    return message.reply({ embeds: [embed] })
  }

  return message.reply('Câu lệnh Rank không hợp lệ. Hãy dùng `!rank` (xem thông tin), `!rank up <số coin>` (nâng rank) hoặc `!rank top` (xem xếp hạng).')
}
