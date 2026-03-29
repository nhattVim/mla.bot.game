import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buyItem, getUserInventory, getBalance, checkBalance, updateBalance, grantItemDb } from '../utils/db.js';

export const SHOP_ITEMS = {
  'title_tanbinh': { name: '🥉 Tân Binh Máu Chó', desc: 'Treo huy hiệu Đồng đàng hoàng trên tên.', price: 10000, type: 'title', emoji: '🥉' },
  'title_vip': { name: '👑 Đặc Quyền VIP', desc: 'Danh hiệu tối thượng của Làng Chơi.', price: 100000, type: 'title', emoji: '👑' },
  'bua_mien_tu': { name: '🛡️ Bùa Miễn Tử', desc: 'Đánh game thua không bị hụt vốn (Dùng 1 lần tự mất).', price: 5000, type: 'consumable', emoji: '🛡️' },
  'x2_reward': { name: '💰 Vé Nhân Đôi', desc: 'Trúng thưởng x2 thu nhập tiền lời (Dùng 1 lần tự mất).', price: 10000, type: 'consumable', emoji: '💰' },
  'hop_mu': { name: '🎁 Hộp Mù Bí Ẩn', desc: 'Đập rương hên xui! Tỷ lệ rớt: (60% Nhận Lúa 500-10,000 | 20% Bùa | 20% Vé x2). Mua xong Đập Luôn!', price: 3000, type: 'gacha', emoji: '🎁' }
};

export async function handleShop(message, args) {
  const balance = await getBalance(message.author.id, message.author.username);

  const embed = new EmbedBuilder()
    .setTitle('🏪 TRUNG TÂM MUA SẮM VẬT PHẨM 🏪')
    .setColor('#ff9f43')
    .setDescription(`Chào mừng bạn ghé thăm Cửa Bách Hoá!\nSố dư hiện tại của bạn: **${balance.toLocaleString()} coins**\n\n*(Bấm các nút Nhãn Hàng bên dưới để Giao dịch)*`)
    .addFields(
      { name: '==== 🎭 CỬA HÀNG DANH HIỆU ====', value: 'Vật phẩm trang trí (Tồn tại vĩnh viễn):' },
      { name: SHOP_ITEMS['title_tanbinh'].name, value: `> 💰 Giá: **${SHOP_ITEMS['title_tanbinh'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['title_tanbinh'].desc}`, inline: true },
      { name: SHOP_ITEMS['title_vip'].name, value: `> 💰 Giá: **${SHOP_ITEMS['title_vip'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['title_vip'].desc}`, inline: true },
      { name: '==== 💊 BÌNH THUỐC TIÊU HAO ====', value: 'Vật phẩm hỗ trợ (Hệ thống tự nhận diện xài khi đánh Game):' },
      { name: SHOP_ITEMS['bua_mien_tu'].name, value: `> 💰 Giá: **${SHOP_ITEMS['bua_mien_tu'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['bua_mien_tu'].desc}`, inline: true },
      { name: SHOP_ITEMS['x2_reward'].name, value: `> 💰 Giá: **${SHOP_ITEMS['x2_reward'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['x2_reward'].desc}`, inline: true },
      { name: SHOP_ITEMS['hop_mu'].name, value: `> 💰 Giá: **${SHOP_ITEMS['hop_mu'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['hop_mu'].desc}`, inline: false }
    )
    .setFooter({ text: 'Việc giao dịch là không thể hoàn tác!' });

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
    if (!hasEnough) return interaction.reply({ content: `❌ Tiền đâu ra mà mua hộp mù tốn kém này! Về đú thêm đua ngựa đi.`, ephemeral: true });
    
    await updateBalance(userId, username, -item.price);
    
    // Random Phần Thưởng:
    const rand = Math.random();
    let rewardText = '';
    let finalBal = 0;

    if (rand < 0.6) { // 60% rớt Tiền
      const randCoin = Math.floor(Math.random() * (10000 - 500 + 1)) + 500;
      finalBal = await updateBalance(userId, username, randCoin);
      rewardText = `💵 **Cơn Mưa Tiền Vàng! Lời ${randCoin.toLocaleString()} coins!**`;
    } else if (rand < 0.8) { // 20% rớt Bùa
      await grantItemDb(userId, username, 'bua_mien_tu');
      finalBal = await getBalance(userId, username);
      rewardText = `🛡️ **Bùa Miễn Tử! Cứu mạng 1 lần.** (Ra gõ \`!b\` để khoe túi)`;
    } else { // 20% rớt x2
      await grantItemDb(userId, username, 'x2_reward');
      finalBal = await getBalance(userId, username);
      rewardText = `💰 **Vé Nhân Đôi Lợi Nhuận! Pay-to-Win.** (Ra gõ \`!b\` để khoe túi)`;
    }

    const gachaEmbed = new EmbedBuilder()
      .setTitle('🎁 KHUI HỘP MÙ! PHẦN THƯỞNG LÀ GÌ ĐÂY??? 🎁')
      .setColor('#9b59b6')
      .setDescription(`<@${userId}> vừa dốc **-${item.price.toLocaleString()} coins** đập vỡ cái Hộp Mù!\n\n✨ **KẾT QUẢ RÚT THƯỞNG:** ✨\n\n> 🎊 ${rewardText}\n\n**Số dư ví hiện hành:** ${finalBal.toLocaleString()} coins.`);

    return interaction.reply({ embeds: [gachaEmbed] });
  }

  const result = await buyItem(userId, username, itemId, item.price);

  if (!result.success) {
    return interaction.reply({ content: `❌ Tạch thanh toán: **${result.message}**`, ephemeral: true });
  }

  // Mua thành công
  const successEmbed = new EmbedBuilder()
    .setTitle('✅ CHÍCH ĐƠN THÀNH CÔNG')
    .setColor('#2ecc71')
    .setDescription(`<@${userId}> vừa dốc hầu bao mua một món đồ xa xỉ!\n- **Vật Phẩm:** ${item.name}\n- **Giá trị:** -${item.price.toLocaleString()} coins.\n- **Lượng Tiền còn lại:** ${result.balance.toLocaleString()} coins.`);

  if (item.type === 'consumable') {
    successEmbed.addFields({ name: 'Cách sử dụng', value: 'Vật phẩm này đã nằm trong Kho Đồ (`!b` để check). Cứ ra ngoài mở sòng đánh cờ bạc như bình thường, Bót sẽ tự kích hoạt Bùa chú nếu cần thiết!' });
  } else {
    successEmbed.addFields({ name: 'Khoác Tướng', value: 'Mua Phát là Ăn luôn! Hãy thử gõ lệnh `!b` ngay bây giờ để được ngắm cái cờ vinh danh cạnh tên bạn!' });
  }

  await interaction.reply({ embeds: [successEmbed] });
}
