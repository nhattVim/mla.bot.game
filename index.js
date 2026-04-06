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
import { getUserInventory } from './utils/db.js'
import { checkRobberEvent } from './games/robber.js'

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
})

// Handle chat commands (Prefix commands)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return

  // Thêm trigger kiểm tra sự kiện Siêu Trộm
  checkRobberEvent(message).catch(console.error)

  // Bắt tin nhắn để kiểm tra nếu kênh đang chơi Word Chain
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

      if (inventory['title_vip']) titleStr = ' - ' + SHOP_ITEMS['title_vip'].emoji + ' ' + SHOP_ITEMS['title_vip'].name
      else if (inventory['title_tanbinh']) titleStr = ' - ' + SHOP_ITEMS['title_tanbinh'].emoji + ' ' + SHOP_ITEMS['title_tanbinh'].name

      if (inventory['bua_mien_tu']) consumableStr += `\n🛡️ Bùa Miễn Tử: **${inventory['bua_mien_tu']}** cái`
      if (inventory['x2_reward']) consumableStr += `\n💰 Vé Tranh Đoạt x2: **${inventory['x2_reward']}** cái`

      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setAuthor({ name: message.author.username + titleStr, iconURL: message.author.displayAvatarURL() })
        .setDescription(`💰 Số dư hiện tại: **${balance.toLocaleString()}** coins.` + (consumableStr ? `\n\n**🎒 Hành Trang:**${consumableStr}` : ''))
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
          .setDescription(
            `Điểm danh thành công! Bạn nhận được **${result.reward.toLocaleString()} coins**.\n\ Số dư hiện tại: **${result.balance.toLocaleString()} coins**.`
          )
        return message.reply({ embeds: [embed] })
      }
    }

    if (command === 'dn') {
      return handleHorseRacing(message, args)
    }

    if (command === 'bc') {
      return handleBauCua(message, args)
    }

    if (command === 'ott') {
      return handleOanTuTi(message, args)
    }

    if (command === 'xd') {
      if (args.length >= 2 && args[1].toLowerCase() === 'host') {
        return handleBlackjackMultiplayer(message, args)
      }
      return handleBlackjack(message, args)
    }

    if (command === 'shop' || command === 's') {
      return handleShop(message, args)
    }

    if (command === 'noitu' || command === 'wc') {
      return handleWordChainCommand(message, args)
    }

    if (command === 'noituvn' || command === 'wcvn') {
      return handleWordChainVnCommand(message, args)
    }

    if (command === 'give') {
      return handleGive(message, args)
    }

    if (command === 'anxin') {
      return handleAnXin(message, args)
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
          { name: 'Kinh Tế', value: '`!give @Người_chơi <Số_tiền>`: Chuyển tiền cho người khác.\n`!anxin @Người_chơi <Số_tiền>`: Yêu cầu người khác cho tiền.', inline: false }
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
      return handleHorseRacingInteraction(interaction)
    }

    if (interaction.customId?.startsWith('bet_bc_') || interaction.customId?.startsWith('modal_bc_') || interaction.customId?.startsWith('bc_host_')) {
      return handleBauCuaInteraction(interaction)
    }

    if (interaction.customId?.startsWith('ott_')) {
      return handleOanTuTiInteraction(interaction)
    }

    if (interaction.customId?.startsWith('bj_')) {
      return handleBlackjackInteraction(interaction)
    }

    if (interaction.customId?.startsWith('bjm_')) {
      return handleBlackMultiplayerInteraction(interaction)
    }

    if (interaction.customId?.startsWith('shopbuy_')) {
      return handleShopInteraction(interaction)
    }

    if (interaction.customId?.startsWith('anxin_')) {
      return handleAnXinInteraction(interaction)
    }
  } catch (e) {
    console.error('Interaction Error:', e)
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Đã xảy ra lỗi khi xử lý thao tác của bạn!', ephemeral: true }).catch(() => {})
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
