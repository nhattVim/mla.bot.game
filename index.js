import http from 'http'
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js'
import dotenv from 'dotenv'
import { connectDB, getBalance, claimDaily, getAllActiveWordChains } from './utils/db.js'
import { handleHorseRacing, handleHorseRacingInteraction } from './games/horse_racing.js'
import { handleBauCua, handleBauCuaInteraction } from './games/baucua.js'
import { handleOanTuTi, handleOanTuTiInteraction } from './games/oantuti.js'
import { handleShop, handleShopInteraction, SHOP_ITEMS } from './games/shop.js'
import { handleGive, handleAnXin, handleAnXinInteraction } from './games/economy.js'
import { handleBlackjack, handleBlackjackInteraction } from './games/blackjack.js'
import { handleBlackjackMultiplayer, handleBlackMultiplayerInteraction } from './games/blackjack_multi.js'
import { handleWordChainCommand, handleWordChainMessage, restoreActiveGames } from './games/wordchain.js'
import { handleWordChainVnCommand, handleWordChainVnMessage, restoreActiveGamesVn } from './games/wordchain_vn.js'
import { getUserInventory, getRankData } from './utils/db.js'
import { checkRobberEvent } from './games/robber.js'
import { handleRankCommand, RANK_NAMES, getRankIcon } from './games/rank.js'
import { setupBangChienCommand, handleBangChienInteraction, checkBangChienRoutine, testGoogleSheetsConnections } from './games/bangchien.js'

dotenv.config()

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
})

const PREFIX = '!'

client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`)
  // Connect to MongoDB
  await connectDB()
  const activeGamesList = await getAllActiveWordChains()
  await restoreActiveGames(activeGamesList)
  await restoreActiveGamesVn(activeGamesList)
  console.log(`[Khôi phục] Đã nạp lại ${activeGamesList.length} phòng Nối Từ đang hoạt động.`)
  
  testGoogleSheetsConnections().catch(console.error)

  // Start Bang Chien cycle check
  checkBangChienRoutine(client).catch(console.error)
  setInterval(() => {
    checkBangChienRoutine(client).catch(console.error)
  }, 60000)
})

// Handle chat commands (Prefix commands)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return

  checkRobberEvent(message).catch(console.error)

  handleWordChainMessage(message)
  handleWordChainVnMessage(message)

  if (!message.content.startsWith(PREFIX)) return

  const args = message.content.slice(PREFIX.length).trim().split(/ +/)
  const command = args.shift().toLowerCase()

  try {
    if (command === 'b') {
      const balance = await getBalance(message.author.id, message.author.username)
      const inventory = await getUserInventory(message.author.id, message.author.username)

      let titleStr = ''
      let consumableStr = ''
      let inventoryItems = []

      if (inventory['title_vip']) titleStr = ' - ' + SHOP_ITEMS['title_vip'].emoji + ' ' + SHOP_ITEMS['title_vip'].name
      else if (inventory['title_tanbinh']) titleStr = ' - ' + SHOP_ITEMS['title_tanbinh'].emoji + ' ' + SHOP_ITEMS['title_tanbinh'].name

      if (inventory['bua_mien_tu']) inventoryItems.push(`🛡️ Bùa Miễn Tử: **${inventory['bua_mien_tu']}** cái`)
      if (inventory['x2_reward']) inventoryItems.push(`💰 Vé Tranh Đoạt x2: **${inventory['x2_reward']}** cái`)

      if (inventoryItems.length > 0) {
        consumableStr = '\n\n🎒 Hành Trang:\n' + inventoryItems.map((item) => {
          return `\u00A0\u00A0•\u00A0\u00A0 ${item}`
        }).join('\n')
      }

      const rankData = await getRankData(message.author.id, message.author.username)
      const rankLevelInfo = rankData.rankLevel || 0
      const rankName = RANK_NAMES[rankLevelInfo]
      const rankIcon = getRankIcon(rankLevelInfo)

      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setAuthor({ name: message.author.displayName + titleStr, iconURL: message.author.displayAvatarURL() })
        .setDescription(`🏆 Cảnh Giới: ${rankIcon} ${rankName}\n💰 Số dư hiện tại: ${balance.toLocaleString()} coins.` + consumableStr)
      return message.reply({ embeds: [embed] })
    }

    if (command === 'dd') {
      const result = await claimDaily(message.author.id, message.author.username)
      if (!result.success) {
        return message.reply({ content: `**THẤT BẠI:** ${result.message}` })
      } else {
        const embed = new EmbedBuilder()
          .setColor('#57F287')
          .setTitle('📅 Điểm Danh Hằng Ngày')
          .setDescription(`Điểm danh thành công! Bạn nhận được **${result.reward.toLocaleString()} coins**.\n\ Số dư hiện tại: **${result.balance.toLocaleString()} coins**.`)
        return message.reply({ embeds: [embed] })
      }
    }

    if (command === 'dn') {
      return await handleHorseRacing(message, args)
    }

    if (command === 'set' && args[0] === 'bc') {
      return await setupBangChienCommand(message, args)
    }

    if (command === 'bc') {
      return await handleBauCua(message, args)
    }

    if (command === 'ott') {
      return await handleOanTuTi(message, args)
    }

    if (command === 'xd') {
      if (args.length >= 2 && args[1].toLowerCase() === 'host') {
        return await handleBlackjackMultiplayer(message, args)
      }
      return await handleBlackjack(message, args)
    }

    if (command === 'shop' || command === 's') {
      return await handleShop(message, args)
    }

    if (command === 'noitu' || command === 'wc') {
      return await handleWordChainCommand(message, args)
    }

    if (command === 'noituvn' || command === 'wcvn') {
      return await handleWordChainVnCommand(message, args)
    }

    if (command === 'rank') {
      return await handleRankCommand(message, args)
    }

    if (command === 'give') {
      return await handleGive(message, args)
    }

    if (command === 'anxin') {
      return await handleAnXin(message, args)
    }

    if (command === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('Danh Sách Lệnh Hệ Thống')
        .setColor('#5865F2')
        .setDescription('Dưới đây là các lệnh hỗ trợ hiện tại:')
        .addFields(
          { name: 'Tài Khoản', value: '`!b`: Xem số dư hiện tại.\n`!dd`: Điểm danh nhận thưởng hàng ngày.\n', inline: false },
          { name: 'Đua Ngựa', value: '`!dn`\nTham gia trường đua, cược ngựa.\n', inline: false },
          { name: 'Bầu Cua', value: '`!bc`\nTham gia lắc bầu cua.\n', inline: false },
          { name: 'Oẳn Tù Tì', value: '`!ott @Người_chơi <Số_tiền>`\nThách đấu người chơi khác.\n', inline: false },
          { name: 'Nối Từ Tiếng Anh', value: '`!noitu start` hoặc `!wc start`\nMở phòng nối tiếng Anh.\n', inline: false },
          { name: 'Nối Từ Tiếng Việt', value: '`!noituvn start` hoặc `!wcvn start`\nMở phòng nối tiếng Việt.\n', inline: false },
          { name: 'Xì Dách', value: '`!xd <Số_tiền>`\nChơi Xì Dách luật Việt Nam với Dealer.\n', inline: false },
          { name: 'Cửa Hàng', value: '`!shop` hoặc `!s`\nMua danh hiệu và vật phẩm.', inline: false },
          { name: 'Kinh Tế', value: '`!give @Người_chơi <Số_tiền>`: Chuyển tiền cho người khác.\n`!anxin @Người_chơi <Số_tiền>`: Yêu cầu người khác cho tiền.', inline: false },
          { name: 'Hệ Thống Tu Vi', value: '`!rank`: Xem thông tin Rank.\n`!rank up <số coin>`: Đổi xu để thăng cấp tu vi.\n`!rank top`: Vinh danh top bảng xếp hạng Chí tôn.', inline: false }
        )
      return message.reply({ embeds: [embed] })
    }
  } catch (error) {
    console.error('Error handling command:', error)
    message.reply('Đã xảy ra lỗi khi xử lý lệnh của bạn!').catch(console.error)
  }
})

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.customId?.startsWith('bet_horse_') || interaction.customId?.startsWith('modal_horse_')) {
      return await handleHorseRacingInteraction(interaction)
    }
    
    if (interaction.customId?.startsWith('bc_')) {
      return await handleBangChienInteraction(interaction)
    }

    if (interaction.customId?.startsWith('bet_bc_') || interaction.customId?.startsWith('modal_bc_') || interaction.customId?.startsWith('bc_host_')) {
      return await handleBauCuaInteraction(interaction)
    }

    if (interaction.customId?.startsWith('ott_')) {
      return await handleOanTuTiInteraction(interaction)
    }

    if (interaction.customId?.startsWith('bj_')) {
      return await handleBlackjackInteraction(interaction)
    }

    if (interaction.customId?.startsWith('bjm_')) {
      return await handleBlackMultiplayerInteraction(interaction)
    }

    if (interaction.customId?.startsWith('shopbuy_')) {
      return await handleShopInteraction(interaction)
    }

    if (interaction.customId?.startsWith('anxin_')) {
      return await handleAnXinInteraction(interaction)
    }
  } catch (e) {
    console.error('Interaction Error:', e)
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Đã xảy ra lỗi khi xử lý thao tác của bạn!', ephemeral: true }).catch(() => { })
    }
  }
})

if (!process.env.DISCORD_TOKEN) {
  console.error('Vui lòng cung cấp DISCORD_TOKEN trong file .env')
  process.exit(1)
}

client.login(process.env.DISCORD_TOKEN)

// Fake web server to keep Render's free instance alive
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Hệ thống Discord Bot Game đang hoạt động 24/7!')
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🌐 [Render Config] Dummy Web Server đang giữ cổng (PORT): ${PORT}`)
})

// Bắt lỗi global để tránh crash app
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Anti-Crash] Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[Anti-Crash] Uncaught Exception:', error)
})
