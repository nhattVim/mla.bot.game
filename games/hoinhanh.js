import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { getBalance, updateBalance, getRandomTrivias } from '../utils/db.js'

const activeHoiNhanhGames = new Set()

// Thuật toán đảo mảng (Fisher-Yates)
function shuffle(array) {
  let currentIndex = array.length, randomIndex
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex--
    ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }
  return array
}

export async function handleHoiNhanh(message, args) {
  const userId = message.author.id
  const username = message.author.username

  if (activeHoiNhanhGames.has(userId)) {
    return message.reply('⏳ Bạn đang trong một ván Hỏi Nhanh rồi, hãy hoàn thành nó trước!')
  }

  const betAmountStr = args[0]
  if (!betAmountStr) {
    return message.reply('⚠️ Cú pháp: `!hn <số tiền cược>`')
  }

  const betAmount = parseInt(betAmountStr.replace(/,/g, ''), 10)
  if (isNaN(betAmount) || betAmount <= 0) {
    return message.reply('⚠️ Số tiền cược không hợp lệ!')
  }

  const balance = await getBalance(userId, username)
  if (balance < betAmount) {
    return message.reply('❌ Bạn không đủ tiền để cược!')
  }

  // Lấy 10 câu hỏi
  const trivias = await getRandomTrivias(10)
  if (!trivias || trivias.length < 10) {
    return message.reply('❌ Kho dữ liệu câu hỏi chưa đủ để chơi ván 10 câu! Vui lòng liên hệ Admin.')
  }

  // Trừ tiền cược
  await updateBalance(userId, username, -betAmount)
  activeHoiNhanhGames.add(userId)

  const wrongAnswers = []
  let currentIndex = 0
  let correctAnswers = 0
  const LETTERS = ['A', 'B', 'C', 'D']

  // Hàm tạo Embed và Component cho câu hỏi hiện tại
  const askQuestion = (index) => {
    const trivia = trivias[index]
    const options = [...trivia.options]
    shuffle(options)
    const correctIndex = options.indexOf(trivia.answer)

    const questionDesc = `> **❓ Câu hỏi:** ${trivia.question}\n\n` +
      LETTERS.map((letter, i) => `**${letter}.** ${options[i]}`).join('\n')

    const embed = new EmbedBuilder()
      .setTitle(`🧠 HỎI NHANH ĐÁP BẬY - CÂU ${index + 1}/10`)
      .setColor('#3498DB')
      .setDescription(questionDesc)
      .setFooter({ text: `⏱️ Bạn có 15s | Hiện đúng: ${correctAnswers}` })

    const row = new ActionRowBuilder()
    LETTERS.forEach((letter, i) => {
      row.addComponents(new ButtonBuilder().setCustomId(`hn_${userId}_${index}_${i}_${correctIndex}`).setLabel(letter).setStyle(ButtonStyle.Primary))
    })

    return { embeds: [embed], components: [row] }
  }

  const gameMsg = await message.reply(askQuestion(currentIndex)).catch(() => null)
  if (!gameMsg) {
    activeHoiNhanhGames.delete(userId)
    // Hoàn tiền nếu lỗi gửi tin
    await updateBalance(userId, username, betAmount)
    return
  }

  const filter = (i) => i.customId.startsWith(`hn_${userId}_`) && i.user.id === userId
  const collector = gameMsg.createMessageComponentCollector({ filter, time: 15000 })

  collector.on('collect', async (i) => {
    await i.deferUpdate().catch(() => {})
    
    const parts = i.customId.split('_')
    const qIndex = parseInt(parts[2], 10)
    const chosenIndex = parseInt(parts[3], 10)
    const correctIndex = parseInt(parts[4], 10)

    // Chỉ xử lý nếu đúng câu hỏi hiện tại
    if (qIndex !== currentIndex) return

    if (chosenIndex === correctIndex) {
      correctAnswers++
    } else {
      wrongAnswers.push({
        q: trivias[currentIndex].question,
        ans: trivias[currentIndex].answer
      })
    }

    currentIndex++

    if (currentIndex < 10) {
      // Chuyển sang câu tiếp theo
      await gameMsg.edit(askQuestion(currentIndex)).catch(() => {})
      collector.resetTimer() // Reset 15s cho câu tiếp theo
    } else {
      collector.stop('finished')
    }
  })

  collector.on('end', async (collected, reason) => {
    activeHoiNhanhGames.delete(userId)

    let wrongStr = ''
    if (wrongAnswers.length > 0) {
      wrongStr = '\n\n**🔍 Các câu sai (để rút kinh nghiệm):**\n' + 
      wrongAnswers.map(w => `❌ ${w.q}\n  => **${w.ans}**`).join('\n')
      // Đảm bảo không quá giới hạn ký tự của embed (khoảng 4096).
      if (wrongStr.length > 2000) wrongStr = wrongStr.substring(0, 2000) + '... (vượt quá độ dài)'
    }

    if (reason === 'finished') {
      // Đã trả lời xong 10 câu
      if (correctAnswers >= 8) {
        // Thắng cược
        const reward = betAmount * 2
        await updateBalance(userId, username, reward)
        
        const winEmbed = new EmbedBuilder()
          .setTitle('🎉 HOÀN THÀNH - BẠN ĐÃ THẮNG!')
          .setColor('#57F287')
          .setDescription(`Chúc mừng <@${userId}> đã trả lời đúng **${correctAnswers}/10** câu.\n\n💰 Bạn nhận được **${reward.toLocaleString()} coins** (1 cược ăn 1).${wrongStr}`)
        await gameMsg.edit({ embeds: [winEmbed], components: [] }).catch(() => {})
      } else {
        // Thua cược
        const loseEmbed = new EmbedBuilder()
          .setTitle('💸 HOÀN THÀNH - BẠN ĐÃ THUA!')
          .setColor('#ED4245')
          .setDescription(`Rất tiếc <@${userId}>, bạn chỉ trả lời đúng **${correctAnswers}/10** câu (Cần 8 câu để thắng).\n\nBạn đã mất **${betAmount.toLocaleString()} coins** tiền cược.${wrongStr}`)
        await gameMsg.edit({ embeds: [loseEmbed], components: [] }).catch(() => {})
      }
    } else {
      // Quá thời gian - Thua luôn
      const timeoutEmbed = new EmbedBuilder()
        .setTitle('⏳ HẾT TIẾP - KẾT THÚC SỚM!')
        .setColor('#ED4245')
        .setDescription(`Bạn đã hết 15 giây để trả lời câu ${currentIndex + 1}!\nCuộc chơi bị hủy và bạn mất **${betAmount.toLocaleString()} coins** tiền cược.\n\n(Chỉ trả lời đúng **${correctAnswers}/10** câu trước khi hết giờ).${wrongStr}`)
      await gameMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {})
    }
  })
}
