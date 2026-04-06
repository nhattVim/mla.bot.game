import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buyItem, getUserInventory, getBalance, checkBalance, updateBalance, grantItemDb } from '../utils/db.js';

export const SHOP_ITEMS = {
  'title_tanbinh': { name: '🥉 Huy Hiệu Tân Binh', desc: 'Hiển thị danh hiệu khi kiểm tra số dư.', price: 10000, type: 'title', emoji: '🥉' },
  'title_vip': { name: '👑 Đặc Quyền VIP', desc: 'Danh hiệu tối cao nâng cấp hồ sơ.', price: 100000, type: 'title', emoji: '👑' },
  'bua_mien_tu': { name: '🛡️ Bùa Miễn Tử', desc: 'Bảo vệ tài sản khỏi 1 ván thua (tiêu hao 1 lần).', price: 10000, type: 'consumable', emoji: '🛡️' },
  'x2_reward': { name: '💰 Vé Nhân Đôi', desc: 'Nhân đôi phần thưởng khi chiến thắng (tiêu hao 1 lần).', price: 30000, type: 'consumable', emoji: '💰' },
  'hop_mu': { name: '🎁 Hộp Quà Bí Ẩn', desc: 'Nhận ngẫu nhiên Coin khủng, Bùa Miễn Tử hoặc Vé x2.', price: 15000, type: 'gacha', emoji: '🎁' }
};

export async function handleShop(message, args) {
  const balance = await getBalance(message.author.id, message.author.username);

  const embed = new EmbedBuilder()
    .setTitle('Cửa Hàng Vật Phẩm')
    .setColor('#5865F2')
    .setDescription(`Số dư hiện tại của bạn: **${balance.toLocaleString()} coins**\n\n*(Sử dụng các nút bên dưới để giao dịch)*`)
    .addFields(
      { name: '==== 🎭 Cửa Hàng Danh Hiệu ====', value: 'Vật phẩm trang trí hiển thị trên hồ sơ:' },
      { name: SHOP_ITEMS['title_tanbinh'].name, value: `> 💰 Giá: **${SHOP_ITEMS['title_tanbinh'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['title_tanbinh'].desc}`, inline: true },
      { name: SHOP_ITEMS['title_vip'].name, value: `> 💰 Giá: **${SHOP_ITEMS['title_vip'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['title_vip'].desc}`, inline: true },
      { name: '==== 💊 Vật Phẩm Hỗ Trợ ====', value: 'Hiệu ứng (hệ thống tự động sử dụng khi đánh game):' },
      { name: SHOP_ITEMS['bua_mien_tu'].name, value: `> 💰 Giá: **${SHOP_ITEMS['bua_mien_tu'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['bua_mien_tu'].desc}\n> ⏳ **Tác dụng tối đa:** 4 lần mỗi ngày`, inline: true },
      { name: SHOP_ITEMS['x2_reward'].name, value: `> 💰 Giá: **${SHOP_ITEMS['x2_reward'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['x2_reward'].desc}\n> ⏳ **Tác dụng tối đa:** 4 lần mỗi ngày`, inline: true },
      { name: SHOP_ITEMS['hop_mu'].name, value: `> 💰 Giá: **${SHOP_ITEMS['hop_mu'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['hop_mu'].desc}`, inline: false }
    )
    .setFooter({ text: 'Việc giao dịch không thể hoàn tác.' });

  const rowTitles = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId(`shopbuy_title_tanbinh`).setLabel('Mua Tân Binh').setEmoji('🥉').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`shopbuy_title_vip`).setLabel('Mua Đặc Quyền VIP').setEmoji('👑').setStyle(ButtonStyle.Danger)
    );

  const rowConsumables = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId(`shopbuy_bua_mien_tu`).setLabel('Mua Bùa Miễn Tử').setEmoji('🛡️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`shopbuy_x2_reward`).setLabel('Mua Vé Nhân 2').setEmoji('💰').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`shopbuy_hop_mu`).setLabel('Đập Hộp Mù').setEmoji('🎁').setStyle(ButtonStyle.Secondary)
    );

  await message.reply({ embeds: [embed], components: [rowTitles, rowConsumables] });
}

export async function handleShopInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('shopbuy_')) return;

  const itemId = interaction.customId.replace('shopbuy_', '');
  const item = SHOP_ITEMS[itemId];
  if (!item) return interaction.reply({ content: 'Không tìm thấy vật phẩm bí ẩn này trên kệ!', ephemeral: true });

  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Xử lý riêng Hộp Mù (Gacha Mua xong bóc luôn)
  if (itemId === 'hop_mu') {
    const hasEnough = await checkBalance(userId, username, item.price);
    if (!hasEnough) return interaction.reply({ content: `❌ Bạn không có đủ tiền để mua vật phẩm này.`, ephemeral: true });

    await updateBalance(userId, username, -item.price);

    // Random Phần Thưởng:
    const rand = Math.random();
    let rewardText = '';
    let finalBal = 0;

    // 85% rớt 1k -> 30k
    if (rand < 0.85) {
      const randCoin = Math.floor(Math.random() * (30000 - 1000 + 1)) + 1000;
      finalBal = await updateBalance(userId, username, randCoin);
      rewardText = `💵 **Tiền Thưởng! Nhận được ${randCoin.toLocaleString()} coins!**`;
    }
    // 5% rớt Bùa
    else if (rand < 0.90) {
      await grantItemDb(userId, username, 'bua_mien_tu');
      finalBal = await getBalance(userId, username);
      rewardText = `🛡️ **Bùa Miễn Tử! Cứu mạng 1 lần.**`;
    }
    // 5% rớt Vé x2
    else if (rand < 0.95) {
      await grantItemDb(userId, username, 'x2_reward');
      finalBal = await getBalance(userId, username);
      rewardText = `💰 **Vé Nhân Đôi! Tiền thưởng x2.**`;
    }
    // 4% rớt 100k
    else if (rand < 0.99) {
      const hugeReward = 100000;
      finalBal = await updateBalance(userId, username, hugeReward);
      rewardText = `💵 **JACKPOT! Trúng giải độc đắc ${hugeReward.toLocaleString()} coins!**`;
    }
    // 1% rớt 1m
    else {
      const megaReward = 1000000;
      finalBal = await updateBalance(userId, username, megaReward);
      rewardText = `💵 **🌟 SIÊU JACKPOT TỐI THƯỢNG!! NHẬN ${megaReward.toLocaleString()} COINS! 🌟**`;
    }

    const gachaEmbed = new EmbedBuilder()
      .setTitle('Kết Quả Mở Hộp Quà Bí Ẩn')
      .setColor('#5865F2')
      .setDescription(`<@${userId}> vừa đổi **-${item.price.toLocaleString()} coins** lấy một hộp quà!\n\n✨ **KẾT QUẢ RÚT THƯỞNG:** ✨\n\n> 🎊 ${rewardText}\n\n**Số dư ví hiện hành:** ${finalBal.toLocaleString()} coins.`);

    return interaction.reply({ embeds: [gachaEmbed] });
  }

  const result = await buyItem(userId, username, itemId, item.price);

  if (!result.success) {
    return interaction.reply({ content: `❌ Giao dịch thất bại: **${result.message}**`, ephemeral: true });
  }

  // Mua thành công
  const successEmbed = new EmbedBuilder()
    .setTitle('Giao Dịch Thành Công')
    .setColor('#57F287')
    .setDescription(`<@${userId}> đã thanh toán vật phẩm mới!\n- **Vật phẩm:** ${item.name}\n- **Giá trị:** -${item.price.toLocaleString()} coins.\n- **Số dư khả dụng:** ${result.balance.toLocaleString()} coins.`);

  if (item.type === 'consumable') {
    successEmbed.addFields({ name: 'Cách sử dụng', value: 'Vật phẩm đã nằm trong Kho Đồ (Sử dụng lệnh `!b` để kiểm tra). Kho đồ tự động sử dụng buff khi bạn tham gia minigame.' });
  } else {
    successEmbed.addFields({ name: 'Danh Hiệu', value: 'Danh hiệu mới đã được gắn vào hồ sơ. Sử dụng lệnh `!b` để xem sự thay đổi.' });
  }

  await interaction.reply({ embeds: [successEmbed] });
}
