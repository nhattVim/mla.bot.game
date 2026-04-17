import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } from 'discord.js'
import { getBangChienConfig, setBangChienConfig, updateBangChienUser, clearBangChienUsersAndMessages, getAllBangChienConfigs } from '../utils/db.js'
import { syncUserRow, clearSheetData, writeHeartbeatInfo } from '../utils/googleSheets.js'

const ROLE_NAME = '🔥 Bang Chiến'

async function getOrCreateRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === ROLE_NAME)
  if (!role) {
    try {
      role = await guild.roles.create({
        name: ROLE_NAME,
        reason: 'Tự động tạo Role cho tính năng Bang Chiến',
        hoist: true
      })
    } catch (error) {
      throw new Error('Bot đang bị thiếu quyền **Quản lý Vai trò (Manage Roles)** để tự động tạo Role Bang Chiến trên Server này. Vui lòng cấp quyền cho Bot rồi thử lại lệnh!')
    }
  }
  return role
}

export async function setupBangChienCommand(message, args) {
  if (args.length < 2) {
    return message.reply('Sai cú pháp! Vui lòng dùng: `!set bc channel` để cài đặt, hoặc `!set bc off` để gỡ bỏ.')
  }

  if (args[1] === 'off') {
    await setBangChienConfig(message.guild.id, { isActive: false })
    return message.reply('✅ Đã gỡ hệ thống Bang Chiến khỏi máy chủ!')
  }

  if (args[1] === 'channel') {
    // Gửi nút setup để người dùng nhập link qua form ẩn
    if (!message.member.permissions.has('Administrator') && !message.member.permissions.has('ManageGuild')) {
      return message.reply('❌ Bạn cần quyền Quản Lý Máy Chủ để dùng lệnh này!')
    }

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bc_setup_link').setLabel('Nhập Link Google Sheets (Bảo mật)').setStyle(ButtonStyle.Primary).setEmoji('🔒'))

    return message.reply({
      content: 'Vui lòng nhấn nút bên dưới để nhập link file Google Sheet, đảm bảo bạn đã cấp quyền chỉnh sửa file Google Sheet cho email sau `bot-bang-chien@mlabot-sheets.iam.gserviceaccount.com`:',
      components: [row]
    })
  }
  if (args[1] === 'test' && args[2] === 'channel') {
    if (!message.member.permissions.has('Administrator') && !message.member.permissions.has('ManageGuild')) {
      return message.reply('❌ Bạn cần quyền Quản Lý Máy Chủ để dùng lệnh này!')
    }
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bc_test_setup_link').setLabel('Thiết lập Test 2 Tuần (Bảo mật)').setStyle(ButtonStyle.Danger).setEmoji('🛠️'))
    return message.reply({
      content: 'Vui lòng nhấn nút bên dưới để nhập link file Google Sheet (Chế độ Test 2 Lượt). Nhớ cấp quyền cho email:\n`bot-bang-chien@mlabot-sheets.iam.gserviceaccount.com`',
      components: [row]
    })
  }

  return message.reply('Sai cú pháp! Vui lòng dùng: `!set bc channel`, `!set bc test channel` hoặc `!set bc off`')
}

export async function handleBangChienInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === 'bc_setup_link') {
      if (!interaction.member.permissions.has('Administrator') && !interaction.member.permissions.has('ManageGuild')) {
        return interaction.reply({ content: '❌ Bạn cần quyền Quản Lý Máy Chủ để thực hiện thao tác này!', ephemeral: true })
      }

      const modal = new ModalBuilder().setCustomId('bc_modal_setup_link').setTitle('Cấu hình File Google Sheets')

      const linkInput = new TextInputBuilder()
        .setCustomId('bc_sheet_link')
        .setLabel('Dán link share vào đây:')
        .setPlaceholder('https://docs.google.com/spreadsheets/d/1MBC0jWC...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(linkInput))
      return await interaction.showModal(modal)
    }

    if (interaction.customId === 'bc_test_setup_link') {
      if (!interaction.member.permissions.has('Administrator') && !interaction.member.permissions.has('ManageGuild')) {
        return interaction.reply({ content: '❌ Bạn cần quyền Quản Lý Máy Chủ để thực hiện thao tác này!', ephemeral: true })
      }

      const modal = new ModalBuilder().setCustomId('bc_modal_test_link').setTitle('Cấu hình File Test Google Sheets')

      const linkInput = new TextInputBuilder()
        .setCustomId('bc_sheet_link')
        .setLabel('Dán link share (DB Test) vào đây:')
        .setPlaceholder('https://docs.google.com/spreadsheets/d/1MBC0jWC...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(linkInput))
      return await interaction.showModal(modal)
    }

    if (interaction.customId === 'bc_join') {
      const modal = new ModalBuilder().setCustomId('bc_modal_join').setTitle('Báo Danh Bang Chiến')

      const ingameInput = new TextInputBuilder().setCustomId('bc_ingame_name').setLabel('Tên Ingame của bạn:').setStyle(TextInputStyle.Short).setRequired(true)

      const noteInput = new TextInputBuilder().setCustomId('bc_note').setLabel('Nguyện vọng/Ghi chú (Không bắt buộc):').setPlaceholder('Ví dụ: Tôi muốn đi cùng với...').setStyle(TextInputStyle.Paragraph).setRequired(false)

      const row1 = new ActionRowBuilder().addComponents(ingameInput)
      const row2 = new ActionRowBuilder().addComponents(noteInput)
      modal.addComponents(row1, row2)
      return await interaction.showModal(modal)
    }

    if (interaction.customId === 'bc_decline') {
      const modal = new ModalBuilder().setCustomId('bc_modal_decline').setTitle('Không Tham Gia Bang Chiến')

      const reasonInput = new TextInputBuilder().setCustomId('bc_reason').setLabel('Lý do vắng mặt (Không bắt buộc):').setStyle(TextInputStyle.Paragraph).setRequired(false)

      const row1 = new ActionRowBuilder().addComponents(reasonInput)
      modal.addComponents(row1)
      return await interaction.showModal(modal)
    }

    if (interaction.customId === 'bc_cancel') {
      await interaction.deferReply({ ephemeral: true })
      let isTestMode = false
      let config = await getBangChienConfig(interaction.guildId, true)
      if (config) {
        isTestMode = true
      } else {
        config = await getBangChienConfig(interaction.guildId, false)
      }
      if (!config) return interaction.editReply('Hệ thống chưa thiết lập!')

      const userDoc = config.usersJoined.find((u) => u.userId === interaction.user.id)
      if (!userDoc || userDoc.status !== 'JOINED') {
        return interaction.editReply('Bạn chưa báo danh Tham Gia, không thể Huỷ!')
      }

      await updateBangChienUser(
        interaction.guildId,
        {
          userId: interaction.user.id,
          username: interaction.user.username,
          status: 'CANCELLED',
          ingameName: userDoc.ingameName,
          notes: userDoc.notes
        },
        isTestMode
      )
      await syncUserRow(config.sheetId, {
        userId: interaction.user.id,
        username: interaction.user.username,
        status: 'CANCELLED',
        ingameName: userDoc.ingameName,
        notes: userDoc.notes
      })

      // Gỡ role
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id)
        if (config.roleId) await member.roles.remove(config.roleId)
      } catch (e) {
        console.error('Không thể gỡ role', e)
      }

      return interaction.editReply('✅ Bạn đã Huỷ tham gia Bang Chiến tuần này thành công!')
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'bc_modal_setup_link') {
      await interaction.deferReply({ ephemeral: true })

      const link = interaction.fields.getTextInputValue('bc_sheet_link')
      const urlMatch = link.match(/\/d\/([a-zA-Z0-9-_]+)/)
      if (!urlMatch) {
        return interaction.editReply('❌ Link Google Sheets cung cấp không hợp lệ!')
      }

      const sheetId = urlMatch[1]
      const guildId = interaction.guildId
      const channelId = interaction.channelId

      let role
      try {
        role = await getOrCreateRole(interaction.guild)
      } catch (error) {
        return interaction.editReply(`❌ **LỖI THIẾT LẬP:** ${error.message}`)
      }

      const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
      const dayOfWeek = vnNow.getUTCDay()
      let targetVnDate = new Date(vnNow)

      let isStartToday = false
      if (dayOfWeek === 1 && targetVnDate.getUTCHours() < 8) {
        isStartToday = true
      } else {
        const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
        targetVnDate.setUTCDate(targetVnDate.getUTCDate() + daysUntilNextMonday)
      }
      targetVnDate.setUTCHours(8, 0, 0, 0)
      const nextStartUTC = new Date(targetVnDate.getTime() - 7 * 60 * 60 * 1000)

      await setBangChienConfig(
        guildId,
        {
          guildId,
          channelId,
          sheetLink: link,
          sheetId,
          isActive: true,
          roleId: role.id,
          nextStartDate: nextStartUTC,
          usersJoined: [],
          weeklyMessageIds: []
        },
        false
      ) // isTestMode = false

      try {
        await writeHeartbeatInfo(sheetId)
      } catch (e) { }

      let msgText = `✅ **Thiết lập Bang Chiến hoàn tất tại kênh <#${channelId}>!**\n`
      if (isStartToday) {
        msgText += `Bot sẽ bắt đầu thông báo gọi điểm danh vào 8:00 AM sáng nay.`
      } else {
        const formattedDate = `${targetVnDate.getUTCDate()}/${targetVnDate.getUTCMonth() + 1}/${targetVnDate.getUTCFullYear()}`
        msgText += `Vì hiện tại đã qua thứ 2 lúc 8h, tính năng sẽ tự khởi chạy chu kì vào **Thứ 2 ngày ${formattedDate} lúc 8:00 AM**.`
      }
      return interaction.editReply(msgText)
    }

    if (interaction.customId === 'bc_modal_test_link') {
      await interaction.deferReply({ ephemeral: true })

      const link = interaction.fields.getTextInputValue('bc_sheet_link')
      const urlMatch = link.match(/\/d\/([a-zA-Z0-9-_]+)/)
      if (!urlMatch) {
        return interaction.editReply('❌ Link Google Sheets cung cấp không hợp lệ!')
      }

      const sheetId = urlMatch[1]
      let role
      try {
        role = await getOrCreateRole(interaction.guild)
      } catch (error) {
        return interaction.editReply(`❌ **LỖI THIẾT LẬP ROLE:** ${error.message}`)
      }

      // Ghi đè cấu hình mới nhất vào DB BangChienTest
      await setBangChienConfig(
        interaction.guildId,
        {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          sheetLink: link,
          sheetId,
          isActive: true,
          roleId: role.id,
          nextStartDate: new Date(Date.now() + 1000), // Bắt đầu test luân phiên ngay sau 1s
          usersJoined: [],
          weeklyMessageIds: [],
          testCyclesCompleted: 0
        },
        true
      ) // isTestMode = true

      try {
        await writeHeartbeatInfo(sheetId)
      } catch (e) { }

      return interaction.editReply(
        `✅ **Thiết lập TEST 2 LƯỢT Bang Chiến hoàn tất tại kênh <#${interaction.channelId}>!**\n⚙️ Hệ thống sẽ mô phỏng bắn đạn mỗi phút 1 lần. Kéo dài 2 lượt (tương ứng 2 tuần ảo). Sau khi hoàn tất sẽ xoá Database BangChienTest tự động.`
      )
    }

    if (interaction.customId === 'bc_modal_join') {
      await interaction.deferReply({ ephemeral: true })
      let isTestMode = false
      let config = await getBangChienConfig(interaction.guildId, true)
      if (config) {
        isTestMode = true
      } else {
        config = await getBangChienConfig(interaction.guildId, false)
      }
      if (!config) return interaction.editReply('Hệ thống chưa thiết lập!')

      const ingameName = interaction.fields.getTextInputValue('bc_ingame_name')
      const notes = interaction.fields.getTextInputValue('bc_note')

      await updateBangChienUser(
        interaction.guildId,
        {
          userId: interaction.user.id,
          username: interaction.user.username,
          status: 'JOINED',
          ingameName,
          notes
        },
        isTestMode
      )
      await syncUserRow(config.sheetId, {
        userId: interaction.user.id,
        username: interaction.user.username,

        status: 'JOINED',
        ingameName,
        notes
      })

      try {
        const member = await interaction.guild.members.fetch(interaction.user.id)
        let role = null
        if (config.roleId) {
          role = interaction.guild.roles.cache.get(config.roleId)
          if (!role) role = await getOrCreateRole(interaction.guild)
        } else {
          role = await getOrCreateRole(interaction.guild)
          config.roleId = role.id
          await config.save()
        }
        await member.roles.add(role)
      } catch (e) {
        console.error('Không thể cấp role', e)
      }

      return interaction.editReply('✅ Đăng ký Tham gia thành công. Bạn đã được cấp Role Bang Chiến!')
    }

    if (interaction.customId === 'bc_modal_decline') {
      await interaction.deferReply({ ephemeral: true })
      let isTestMode = false
      let config = await getBangChienConfig(interaction.guildId, true)
      if (config) {
        isTestMode = true
      } else {
        config = await getBangChienConfig(interaction.guildId, false)
      }
      if (!config) return interaction.editReply('Hệ thống chưa thiết lập!')

      const notes = interaction.fields.getTextInputValue('bc_reason')

      await updateBangChienUser(
        interaction.guildId,
        {
          userId: interaction.user.id,
          username: interaction.user.username,
          status: 'NOT_JOINING',
          notes
        },
        isTestMode
      )
      const isOk = await syncUserRow(config.sheetId, {
        userId: interaction.user.id,
        username: interaction.user.username,
        status: 'NOT_JOINING',
        notes
      })

      // Gỡ role nếu nhầm bấm lại
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id)
        if (config.roleId) await member.roles.remove(config.roleId)
      } catch (e) { }

      if (isOk) return interaction.editReply('✅ Đã ghi nhận bạn vắng mặt Bang chiến tuần này!')
      else return interaction.editReply('❌ Đã lưu tạm thời nhưng không thể ghi Google Sheets. Vui lòng báo dev kiểm tra Auth!')
    }
  }
}

export async function checkBangChienRoutine(client) {
  const configs = await getAllBangChienConfigs(false)
  const now = new Date()
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const vnHour = vnNow.getUTCHours()
  const vnDayOfWeek = vnNow.getUTCDay()

  for (const config of configs) {
    if (!config.isActive) continue
    if (config.nextStartDate && now < config.nextStartDate) continue

    const lastNoti = config.lastNotificationDate
    let hasNotifiedToday = false
    if (lastNoti) {
      const vnLastNoti = new Date(lastNoti.getTime() + 7 * 60 * 60 * 1000)
      if (vnLastNoti.getUTCFullYear() === vnNow.getUTCFullYear() && vnLastNoti.getUTCMonth() === vnNow.getUTCMonth() && vnLastNoti.getUTCDate() === vnNow.getUTCDate()) {
        hasNotifiedToday = true
      }
    }

    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) continue
    const channel = guild.channels.cache.get(config.channelId)
    if (!channel) continue

    if (vnDayOfWeek >= 1 && vnDayOfWeek <= 6 && vnHour >= 8 && !hasNotifiedToday) {
      if (config.weeklyMessageIds && config.weeklyMessageIds.length > 0) {
        for (let msgId of config.weeklyMessageIds) {
          try {
            const msg = await channel.messages.fetch(msgId)
            const disabledRow = new ActionRowBuilder().addComponents(msg.components[0].components.map((c) => ButtonBuilder.from(c).setDisabled(true)))
            await msg.edit({ components: [disabledRow] })
          } catch (e) { }
        }
      }

      await guild.members.fetch()
      let tags = ''
      if (vnDayOfWeek === 1) {
        tags = '@everyone'
      } else {
        const joinedIds = config.usersJoined.map((u) => u.userId)
        const missingMembers = guild.members.cache.filter((m) => {
          if (m.user.bot) return false
          if (joinedIds.includes(m.id)) return false
          const perms = channel.permissionsFor(m)
          return perms && perms.has(PermissionsBitField.Flags.ViewChannel)
        })
        tags = missingMembers.map((m) => `<@${m.id}>`).join(' ')
      }

      if (tags.length === 0 && vnDayOfWeek !== 1) {
        await setBangChienConfig(config.guildId, { lastNotificationDate: now }, false)
        continue
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bc_join').setLabel('Tham Gia').setStyle(ButtonStyle.Success).setEmoji('🔥'),
        new ButtonBuilder().setCustomId('bc_decline').setLabel('Không Tham Gia').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('bc_cancel').setLabel('Huỷ Tham Gia (Đã đk)').setStyle(ButtonStyle.Secondary)
      )

      let embedDesc = ''
      if (tags === '@everyone') {
        embedDesc = `Mọi người ơi vào báo danh tham gia Bang chiến !\n\n${tags}\n\nHi vọng mọi người dành ra 30s để báo danh bang chiên. Nhằm để đương gia xếp team !`
      } else {
        embedDesc = `Các bạn ${tags} hi vọng các bạn bỏ ra một tí thời gian để báo danh bang chiến, không tham gia được vẫn báo để đương gia xếp team. Cảm ơn mọi người nhiều !`
      }

      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('📢 ĐIỂM DANH BANG CHIẾN')
        .setDescription(embedDesc)

      const sentMsg = await channel.send({ content: tags.substring(0, 1500), embeds: [embed], components: [row] })

      config.weeklyMessageIds = config.weeklyMessageIds || []
      config.weeklyMessageIds.push(sentMsg.id)

      await setBangChienConfig(
        config.guildId,
        {
          weeklyMessageIds: config.weeklyMessageIds,
          lastNotificationDate: now
        },
        false
      )
    }

    if (vnDayOfWeek === 0 && vnHour >= 23) {
      const lastReset = config.currentCycleStart
      if (!lastReset || now - lastReset > 24 * 60 * 60 * 1000) {
        await clearSheetData(config.sheetId)
        await clearBangChienUsersAndMessages(config.guildId, false)

        if (config.roleId) {
          try {
            await guild.members.fetch()
            const role = guild.roles.cache.get(config.roleId)
            if (role) {
              guild.members.cache.forEach((m) => {
                if (m.roles.cache.has(role.id)) m.roles.remove(role.id)
              })
            }
          } catch (e) { }
        }

        let nm = new Date(vnNow)
        const daysToMon = 8 - vnDayOfWeek
        nm.setUTCDate(nm.getUTCDate() + daysToMon)
        nm.setUTCHours(8, 0, 0, 0)
        await setBangChienConfig(
          config.guildId,
          {
            currentCycleStart: now,
            nextStartDate: new Date(nm.getTime() - 7 * 60 * 60 * 1000),
            isActive: true
          },
          false
        )
      }
    }
  }
}

export async function checkBangChienTestRoutine(client) {
  const configs = await getAllBangChienConfigs(true)
  const now = new Date()

  for (const config of configs) {
    if (!config.isActive) continue
    if (config.nextStartDate && now < config.nextStartDate) continue

    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) continue
    const channel = guild.channels.cache.get(config.channelId)
    if (!channel) continue

    const iterations = config.weeklyMessageIds ? config.weeklyMessageIds.length : 0
    const testCyclesCompleted = config.testCyclesCompleted || 0

    if (iterations < 5) {
      if (iterations === 0) {
        await clearBangChienUsersAndMessages(config.guildId, true)
        config.usersJoined = []
        config.weeklyMessageIds = []
      } else {
        for (let msgId of config.weeklyMessageIds) {
          try {
            const msg = await channel.messages.fetch(msgId)
            const disabledRow = new ActionRowBuilder().addComponents(msg.components[0].components.map((c) => ButtonBuilder.from(c).setDisabled(true)))
            await msg.edit({ components: [disabledRow] })
          } catch (e) { }
        }
      }

      await guild.members.fetch()
      let tags = ''
      if (iterations === 0) {
        tags = '@everyone'
      } else {
        const joinedIds = config.usersJoined.map((u) => u.userId)
        const missingMembers = guild.members.cache.filter((m) => {
          if (m.user.bot) return false
          if (joinedIds.includes(m.id)) return false
          const perms = channel.permissionsFor(m)
          return perms && perms.has(PermissionsBitField.Flags.ViewChannel)
        })
        tags = missingMembers.map((m) => `<@${m.id}>`).join(' ')
      }

      if (tags.length === 0 && iterations !== 0) {
        config.weeklyMessageIds = config.weeklyMessageIds || []
        config.weeklyMessageIds.push('dummy_' + Date.now())
        await setBangChienConfig(
          config.guildId,
          {
            weeklyMessageIds: config.weeklyMessageIds,
            nextStartDate: new Date(now.getTime() + 60000)
          },
          true
        )
        continue
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bc_join').setLabel('Tham Gia').setStyle(ButtonStyle.Success).setEmoji('🔥'),
        new ButtonBuilder().setCustomId('bc_decline').setLabel('Không Tham Gia').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('bc_cancel').setLabel('Huỷ Tham Gia (Đã đk)').setStyle(ButtonStyle.Secondary)
      )

      let embedDesc = ''
      if (tags === '@everyone') {
        embedDesc = `Mọi người ơi vào báo danh tham gia Bang chiến !\n\n${tags}\n\nHi vọng mọi người dành ra 30s để báo danh bang chiên. Nhằm để đương gia xếp team !`
      } else {
        embedDesc = `Các bạn ${tags} hi vọng các bạn bỏ ra một tí thời gian để báo danh bang chiến, không tham gia được vẫn báo để đương gia xếp team. Cảm ơn mọi người nhiều !`
      }

      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle(`📢 ĐIỂM DANH BANG CHIẾN (TEST Tuần ${testCyclesCompleted + 1} - Lần ${iterations + 1}/5)`)
        .setDescription(embedDesc)

      try {
        const sentMsg = await channel.send({ content: tags.substring(0, 1500), embeds: [embed], components: [row] })
        config.weeklyMessageIds = config.weeklyMessageIds || []
        config.weeklyMessageIds.push(sentMsg.id)

        await setBangChienConfig(
          config.guildId,
          {
            weeklyMessageIds: config.weeklyMessageIds,
            nextStartDate: new Date(now.getTime() + 60000)
          },
          true
        )
      } catch (err) {
        console.error(`Lỗi channel.send TestMode:`, err.message)
      }
    } else {
      await channel.send(`🛑 **[KẾT THÚC TUẦN ${testCyclesCompleted + 1}]** Đã hoàn tất 5 lần gọi báo danh! Bắt đầu lệnh RESET xoá Excel và thu hồi Role...`)

      await clearSheetData(config.sheetId)
      await clearBangChienUsersAndMessages(config.guildId, true)

      if (config.roleId) {
        try {
          await guild.members.fetch()
          const role = guild.roles.cache.get(config.roleId)
          if (role) {
            guild.members.cache.forEach((m) => {
              if (m.roles.cache.has(role.id)) m.roles.remove(role.id)
            })
          }
        } catch (e) { }
      }

      if (testCyclesCompleted >= 1) {
        await channel.send(`✅ **[HOÀN TẤT CHUỖI TEST]** Đã hoàn thành mô phỏng 2 Tuần! Database cấu hình Test cho Server này đã bị xoá. Để test lại, dùng lệnh \`!set bc test channel\` lần nữa.`)
        import('../utils/db.js')
          .then((module) => {
            module.deleteBangChienConfig(config.guildId, true).catch(console.error)
          })
          .catch(console.error)
      } else {
        await setBangChienConfig(
          config.guildId,
          {
            testCyclesCompleted: testCyclesCompleted + 1,
            nextStartDate: new Date(now.getTime() + 60000),
            weeklyMessageIds: [],
            usersJoined: []
          },
          true
        )
      }
    }
  }
}

export async function testGoogleSheetsConnections() {
  const configs = await getAllBangChienConfigs()
  for (const config of configs) {
    if (config.sheetId && config.isActive) {
      await writeHeartbeatInfo(config.sheetId)
    }
  }
}
