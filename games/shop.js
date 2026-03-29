import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buyItem, getUserInventory, getBalance } from '../utils/db.js';

export const SHOP_ITEMS = {
  'title_tanbinh': { name: '🥉 Tân Binh Máu Chó', desc: 'Treo huy hiệu Đồng đàng hoàng trên tên.', price: 10000, type: 'title', emoji: '🥉' },
  'title_vip': { name: '👑 Đặc Quyền VIP', desc: 'Danh hiệu tối thượng của Làng Chơi.', price: 100000, type: 'title', emoji: '👑' },
  'bua_mien_tu': { name: '🛡️ Bùa Miễn Tử', desc: 'Đánh game thua không bị hụt vốn (Dùng 1 lần tự mất).', price: 5000, type: 'consumable', emoji: '🛡️' },
  'x2_reward': { name: '💰 Vé Nhân Đôi', desc: 'Trúng thưởng x2 thu nhập tiền lời (Dùng 1 lần tự mất).', price: 10000, type: 'consumable', emoji: '💰' }
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
      { name: SHOP_ITEMS['x2_reward'].name, value: `> 💰 Giá: **${SHOP_ITEMS['x2_reward'].price.toLocaleString()} coins**\n> 📋 ${SHOP_ITEMS['x2_reward'].desc}`, inline: true }
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
      new ButtonBuilder().setCustomId(`shopbuy_x2_reward`).setLabel('Mua Vé Nhân 2').setEmoji('💰').setStyle(ButtonStyle.Success)
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
