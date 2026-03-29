import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas } from 'canvas';
import { getBalance, updateBalance, checkBalance } from '../utils/db.js';

const activeGames = new Map();

const HORSE_EMOJIS = ['🔴', '🔵', '🟢', '🟡', '🟣'];
const LINE_COLORS = ['🟥', '🟦', '🟩', '🟨', '🟪'];
const EMPTY_BLOCK = '⬛';
const TRACK_LENGTH = 20; 
const WINNING_REWARD_MULTIPLIER = 4;

function drawHorseResult(winningHorseIndex) {
  const canvas = createCanvas(400, 300);
  const ctx = canvas.getContext('2d');
  
  // Nền
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, 400, 300);

  // Bục vinh quang
  ctx.fillStyle = '#4cd137'; // Xanh lá cây
  ctx.fillRect(100, 200, 200, 100);
  ctx.fillStyle = '#44bd32';
  ctx.fillRect(100, 190, 200, 10);
  
  // Biểu tượng vô địch
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  
  ctx.fillStyle = '#f1c40f';
  ctx.font = '80px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏆', 200, 110);
  
  ctx.shadowBlur = 0;

  // Text chiến thắng
  const textColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'];
  ctx.fillStyle = textColors[winningHorseIndex];
  ctx.font = 'bold 45px sans-serif';
  ctx.fillText(`NGỰA SỐ ${winningHorseIndex + 1}`, 200, 170);
  
  // Chấm trang trí mã ngựa
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('WINNER', 200, 250);

  return new AttachmentBuilder(canvas.toBuffer(), { name: 'horse-result.png' });
}

export async function handleHorseRacing(message, args) {
  const channelId = message.channel.id;
  
  if (!activeGames.has(channelId)) {
    activeGames.set(channelId, { state: 'IDLE', bets: [] });
  }
  
  const game = activeGames.get(channelId);
  const action = args[0] ? args[0].toLowerCase() : '';

  if (action === 'start') {
    if (game.state !== 'IDLE') {
      return message.reply('Cuộc đua đang diễn ra hoặc đang mở cược!');
    }
    
    game.state = 'BETTING';
    game.bets = [];
    
    const endTime = Math.floor(Date.now() / 1000) + 30;
    const embed = new EmbedBuilder()
      .setTitle('🏁 TRƯỜNG ĐUA NGỰA MỞ CỬA 🏁')
      .setDescription(`Cổng cược sẽ đóng **<t:${endTime}:R>**! Hãy dùng lệnh:\n\`!dn bet <mã ngựa 1-5> <tiền>\`\n\n*(Tỷ lệ ăn thưởng x4)*`)
      .addFields({
        name: 'Mã Ngựa',
        value: '`1`: 🔴 Đỏ\n`2`: 🔵 Xanh dương\n`3`: 🟢 Xanh lục\n`4`: 🟡 Vàng\n`5`: 🟣 Tím'
      })
      .setColor('#3498db');
      
    await message.channel.send({ embeds: [embed] });
    
    setTimeout(() => startRace(message.channel, channelId), 30000);
    return;
  }

  if (action === 'bet') {
    if (game.state !== 'BETTING') {
      return message.reply('Hiện không có cuộc đua nào đang nhận cược!');
    }

    const horseId = parseInt(args[1], 10);
    const amountStr = args[2];
    
    let amount;
    if (amountStr === 'all' || amountStr === 'allin') {
      amount = getBalance(message.author.id);
    } else {
      amount = parseInt(amountStr, 10);
    }
    
    if (isNaN(horseId) || horseId < 1 || horseId > 5) {
      return message.reply('Màu ngựa không hợp lệ. Vui lòng chọn từ 1 đến 5.');
    }
    
    if (isNaN(amount) || amount <= 0) {
      return message.reply('Số tiền cược không hợp lệ.');
    }
    
    if (!checkBalance(message.author.id, amount)) {
      return message.reply('Tài khoản của bạn không đủ tiền để tham gia mức cược này.');
    }
    
    updateBalance(message.author.id, -amount);
    
    game.bets.push({
      userId: message.author.id,
      horseIndex: horseId - 1,
      amount: amount
    });
    
    return message.reply(`✅ Cược thành công **${amount.toLocaleString()} coins** vào ngựa số **${horseId}** ${HORSE_EMOJIS[horseId - 1]}`);
  }

  return message.reply('Lệnh sai, dùng `!dn start` hoặc `!dn bet <mã 1-5> <số tiền>`');
}

async function startRace(channel, channelId) {
  const game = activeGames.get(channelId);
  game.state = 'RACING';
  
  if (game.bets.length === 0) {
    channel.send('Không có ai cược! Hủy cuộc đua.');
    activeGames.delete(channelId);
    return;
  }
  
  const horses = [0, 0, 0, 0, 0];
  
  const renderTrack = () => {
    return horses.map((pos, idx) => {
      const safePos = Math.min(pos, TRACK_LENGTH - 1);
      const coloredLine = LINE_COLORS[idx].repeat(safePos);
      const remainingLine = EMPTY_BLOCK.repeat(Math.max(0, TRACK_LENGTH - safePos - 1));
      return `[**${idx + 1}**] ${coloredLine}🏇${remainingLine} 🏁`;
    }).join('\n\n');
  };
  
  const raceEmbed = new EmbedBuilder()
    .setTitle('🏇 CUỘC ĐUA BẮT ĐẦU 🏇')
    .setColor('#e74c3c')
    .setDescription(renderTrack());
    
  const raceMsg = await channel.send({ embeds: [raceEmbed] });
  
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  let winningHorse = -1;

  while (true) {
    await sleep(2000); 
    
    let isFinished = false;
    let eventLog = 'Khán giả đang hò reo cổ vũ...';
    
    const hasEvent = Math.random() < 0.3; // 30% chance for an event
    let eventHorse = -1;
    let eventType = -1; 
    
    if (hasEvent) {
      eventHorse = Math.floor(Math.random() * horses.length);
      eventType = Math.floor(Math.random() * 3); // 0: Sprint, 1: Trip, 2: Confused
    }
    
    for (let i = 0; i < horses.length; i++) {
      let step = Math.floor(Math.random() * 4); // 0-3 bước bình thường
      
      if (i === eventHorse) {
        if (eventType === 0) {
          step += 3;
          eventLog = `⚡ KIẾN TẠO! Ngựa số ${i+1} bứt tốc kinh hoàng!`;
        } else if (eventType === 1) {
          step = 0;
          eventLog = `💥 TAI NẠN! Ngựa số ${i+1} bị vấp ngã và khựng lại!`;
        } else if (eventType === 2) {
          step = -1;
          eventLog = `🌪️ LÚ LẪN! Ngựa số ${i+1} chạy lùi về phía sau!`;
        }
      }
      
      horses[i] = Math.max(0, horses[i] + step); // Không lùi quá vạch xuất phát
      
      if (horses[i] >= TRACK_LENGTH - 1) {
        horses[i] = TRACK_LENGTH - 1;
        if (!isFinished) {
          isFinished = true;
          winningHorse = i;
        }
      }
    }
    
    raceEmbed.setDescription(`${renderTrack()}\n\n🎙️ **Bình luận:**\n> *${eventLog}*`);
    await raceMsg.edit({ embeds: [raceEmbed] }).catch(() => {});
    
    if (isFinished) break;
  }
  
  await sleep(1000); // Đợi 1 nhịp để khán giả thấy ngựa cán đích
  
  // Tính tiền
  let totalRewardStr = '';
  const userWinning = {};
  
  for (const bet of game.bets) {
    if (bet.horseIndex === winningHorse) {
      if (!userWinning[bet.userId]) userWinning[bet.userId] = 0;
      userWinning[bet.userId] += (bet.amount * WINNING_REWARD_MULTIPLIER) + bet.amount;
      updateBalance(bet.userId, (bet.amount * WINNING_REWARD_MULTIPLIER) + bet.amount);
    }
  }
  
  for (const [userId, winAmt] of Object.entries(userWinning)) {
    totalRewardStr += `<@${userId}> thắng **${winAmt.toLocaleString()}** coins!\n`;
  }
  
  if (totalRewardStr === '') totalRewardStr = 'Khán đài than khóc! Không ai cược trúng ngựa vô địch 😢';
  
  // Tạo hình ảnh
  const attachment = drawHorseResult(winningHorse);
  
  const resultEmbed = new EmbedBuilder()
    .setTitle('🏆 CUỘC ĐUA KẾT THÚC 🏆')
    .setColor('#f1c40f')
    .setImage('attachment://horse-result.png')
    .setDescription(`**Ngựa số ${winningHorse + 1} vô địch!**\n\n**Kết quả trả thưởng:**\n${totalRewardStr}`);

  await channel.send({ embeds: [resultEmbed], files: [attachment] });
  
  activeGames.delete(channelId);
}
