import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas } from 'canvas';
import { getBalance, updateBalance, checkBalance } from '../utils/db.js';

// Lưu trữ trạng thái game theo từng channel ID
// { state: 'IDLE' | 'BETTING' | 'ROLLING', bets: [], message: null }
const activeGames = new Map();

// Các con vật và emoji tương ứng
const ANIMALS = ['bau', 'cua', 'tom', 'ca', 'ga', 'nai'];
const EMOJIS = {
  bau: '🎃 Bầu', cua: '🦀 Cua', tom: '🦐 Tôm',
  ca: '🐟 Cá', ga: '🐔 Gà', nai: '🦌 Nai'
};

const COLORS = {
  bau: '#f39c12', cua: '#e74c3c', tom: '#e67e22',
  ca: ' #3498db', ga: '#f1c40f', nai: '#8e44ad'
};

function drawBauCuaResult(results) {
  const canvas = createCanvas(600, 200);
  const ctx = canvas.getContext('2d');
  
  // Vẽ nền (dark mode)
  ctx.fillStyle = '#2b2d31'; // Giống màu background Discord
  ctx.fillRect(0, 0, 600, 200);

  // Vẽ 3 ô vuông kết quả
  results.forEach((animal, i) => {
    const startX = 40 + (i * 180);
    const startY = 30;
    
    // Đổ bóng nhẹ
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;

    // Hình chữ nhật bo góc bằng polyfill (hoặc roundRect nếu Node.js >= 20, nhưng để an toàn cứ dùng line/arc)
    ctx.fillStyle = COLORS[animal] || '#ffffff';
    ctx.beginPath();
    ctx.roundRect(startX, startY, 150, 140, 20); // Vẽ ô chữ nhật
    ctx.fill();

    // Tắt bóng
    ctx.shadowBlur = 0;
    
    // Viết chữ
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const label = animal.toUpperCase();
    ctx.fillText(label, startX + 75, startY + 70);
  });

  return new AttachmentBuilder(canvas.toBuffer(), { name: 'baucua-result.png' });
}

export async function handleBauCua(message, args) {
  const channelId = message.channel.id;
  
  if (!activeGames.has(channelId)) {
    activeGames.set(channelId, { state: 'IDLE', bets: [] });
  }
  
  const game = activeGames.get(channelId);
  const action = args[0] ? args[0].toLowerCase() : '';

  if (action === 'start') {
    if (game.state !== 'IDLE') {
      return message.reply('Sòng Bầu Cua đang mở cược hoặc đang lắc!');
    }
    
    game.state = 'BETTING';
    game.bets = [];
    
    const endTime = Math.floor(Date.now() / 1000) + 30;
    const embed = new EmbedBuilder()
      .setTitle('🎲 SÒNG BẦU CUA ĐÃ MỞ!')
      .setDescription(`Cổng cược sẽ đóng **<t:${endTime}:R>**! Hãy đặt cược bằng lệnh:\n\`!bc bet <con vật> <tiền>\`\n\n*(Mỗi con vật xuất hiện 1 lần trả thưởng x1, 2 lần x2, 3 lần x3)*`)
      .addFields({ name: 'Các con vật hợp lệ', value: '`bau` (🎃), `cua` (🦀), `tom` (🦐), `ca` (🐟), `ga` (🐔), `nai` (🦌)' })
      .setColor('#f1c40f');

    await message.channel.send({ embeds: [embed] });
    
    setTimeout(() => rollDice(message.channel, channelId), 30000);
    return;
  }

  if (action === 'bet') {
    if (game.state !== 'BETTING') {
      return message.reply('Sòng chưa mở cược! Hãy bắt đầu bằng `!bc start`');
    }

    const animalName = args[1] ? args[1].toLowerCase() : '';
    const amountStr = args[2];
    
    if (!ANIMALS.includes(animalName)) {
      return message.reply('Tên con vật hợp lệ là: `bau`, `cua`, `tom`, `ca`, `ga`, `nai`');
    }
    
    let amount;
    if (amountStr === 'all' || amountStr === 'allin') {
      amount = getBalance(message.author.id);
    } else {
      amount = parseInt(amountStr, 10);
    }
    
    if (isNaN(amount) || amount <= 0) {
      return message.reply('Số tiền cược không hợp lệ.');
    }
    
    if (!checkBalance(message.author.id, amount)) {
      return message.reply('Tài khoản của bạn không đủ tiền để cược tiếp!');
    }
    
    updateBalance(message.author.id, -amount);
    
    game.bets.push({
      userId: message.author.id,
      animal: animalName,
      amount: amount
    });
    
    return message.reply(`✅ Bạn đặt **${amount.toLocaleString()} coins** vào **${EMOJIS[animalName]}**`);
  }

  return message.reply('Lệnh không đúng. Dùng `!bc start` hoặc `!bc bet <con vật> <số tiền>`');
}

async function rollDice(channel, channelId) {
  const game = activeGames.get(channelId);
  game.state = 'ROLLING';
  
  if (game.bets.length === 0) {
    channel.send('Không có ai đặt cược. Hủy sòng!');
    activeGames.delete(channelId);
    return;
  }

  const rollingEmbed = new EmbedBuilder()
    .setTitle('🎲 NHÀ CÁI ĐANG XÓC ĐĨA...')
    .setColor('#e67e22')
    .setDescription('**[ ❓ | ❓ | ❓ ]**');
    
  const rollingMsg = await channel.send({ embeds: [rollingEmbed] });
  
  // Animation frames (Shuffling effect)
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const frames = [
    '**[ 🧊 | 🧊 | 🧊 ]**\n*Lắc lắc lắc...*',
    '**[ 🎲 | 🧊 | 🎲 ]**\n*Xóc xóc xóc...*',
    '**[ ❓ | 🎲 | ❓ ]**\n*Sắp ra...*'
  ];

  for (let i = 0; i < frames.length; i++) {
    await sleep(1500); // 1.5 giây mỗi nhịp
    rollingEmbed.setDescription(frames[i]);
    await rollingMsg.edit({ embeds: [rollingEmbed] }).catch(() => {});
  }
  
  await sleep(1500);

  // Kết quả cuối
  const results = [
    ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
    ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
    ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  ];
  
  const resultCounts = {};
  for (const res of results) {
    resultCounts[res] = (resultCounts[res] || 0) + 1;
  }
  
  let totalWinStr = '';
  const userWinning = {};
  
  for (const bet of game.bets) {
    if (resultCounts[bet.animal] > 0) {
      const multiply = resultCounts[bet.animal];
      const winAmt = bet.amount + (bet.amount * multiply);
      if (!userWinning[bet.userId]) userWinning[bet.userId] = 0;
      userWinning[bet.userId] += winAmt;
      
      updateBalance(bet.userId, winAmt);
    }
  }
  
  for (const [userId, totalWin] of Object.entries(userWinning)) {
    totalWinStr += `<@${userId}> trúng **${totalWin.toLocaleString()}** coins!\n`;
  }
  
  if (totalWinStr === '') totalWinStr = 'Nhà cái húp trọn! Không ai trúng cả 😢';
  
  // Vẽ ảnh kết quả
  const attachment = drawBauCuaResult(results);

  const resultEmbed = new EmbedBuilder()
    .setTitle('🎲 KẾT QUẢ BẦU CUA 🎲')
    .setColor('#2ecc71')
    .setImage('attachment://baucua-result.png')
    .setDescription(`**Kết quả là:** ${results.map(r => EMOJIS[r]).join(' | ')}\n\n**Bảng Vàng Trúng Giải:**\n${totalWinStr}`);
  
  // Gửi lại tin nhắn cuối cùng để ping người dùng
  await channel.send({ embeds: [resultEmbed], files: [attachment] });
  await rollingMsg.delete().catch(() => {}); // Xóa tin nhắn lắc thừa
  
  activeGames.delete(channelId);
}
